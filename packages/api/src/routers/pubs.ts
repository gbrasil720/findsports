import { db, eq, sql } from '@findsports_oficial/db'
import {
  bar,
  sport,
  team,
  userFavoriteBars,
  userPreferenceSports
} from '@findsports_oficial/db/schema/platform'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import { protectedProcedure, router } from '../index'
import { decodeCursor, encodeCursor } from '../lib/keyset-cursor'
import { createTtlCache } from '../lib/ttl-cache'

/**
 * ESC-08: catálogos são iguais para todo mundo e mudam raramente, mas eram
 * relidos do banco a cada sessão. Ficam em memória por alguns minutos.
 *
 * Só entra aqui dado global. Nada que dependa de sessão pode ser cacheado
 * assim — o cache é compartilhado por todas as requisições da instância.
 */
const CATALOGO_TTL_MS = 5 * 60_000
/** Jogos em destaque mudam com o tempo; janela curta para não mostrar jogo já começado. */
const DESTAQUES_TTL_MS = 60_000

const cacheEsportes = createTtlCache<(typeof sport.$inferSelect)[]>({
  ttlMs: CATALOGO_TTL_MS
})
const cacheTimes = createTtlCache<(typeof team.$inferSelect)[]>({
  ttlMs: CATALOGO_TTL_MS,
  maxEntries: 50
})
const cacheDestaques = createTtlCache<Record<string, unknown>[]>({
  ttlMs: DESTAQUES_TTL_MS
})

/** Última tupla de ordenação de `search`: plano, próximo jogo, distância, id. */
const searchCursorSchema = z.object({
  p: z.number(),
  e: z.string(),
  d: z.number(),
  i: z.string()
})

/** Última tupla de ordenação de `searchByLocation`: distância e id. */
const locationCursorSchema = z.object({
  d: z.number(),
  i: z.string()
})

export const pubsRouter = router({
  search: protectedProcedure
    .input(
      z.object({
        lat: z.number(),
        lng: z.number(),
        radiusKm: z
          .union([z.literal(1), z.literal(3), z.literal(5), z.literal(10)])
          .default(3),
        sportId: z.string().uuid().optional(),
        championship: z.string().optional(),
        date: z.string().date().optional(),
        cursor: z.string().optional(),
        limit: z.number().min(1).max(50).default(20)
      })
    )
    .query(async ({ input }) => {
      const { lat, lng, radiusKm, sportId, championship, date, cursor, limit } =
        input

      // Ponto de busca como geography — casado com o índice GiST parcial
      // `bar_geo_active_idx` (ver migration 0013). Parametrizado: o mesmo
      // plano de execução é reaproveitado entre requisições.
      const origin = sql`ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography`
      const radiusMeters = radiusKm * 1000

      const sportFilter = sportId ? sql`AND e.sport_id = ${sportId}` : sql``
      const championshipPattern = championship
        ? `%${championship.toLowerCase()}%`
        : ''
      // O filtro de campeonato também casa pelo nome do bar (comportamento
      // original): um bar cujo nome bate qualifica com qualquer jogo futuro.
      const champBarFilter = championship
        ? sql`AND (LOWER(e.championship) LIKE ${championshipPattern} OR LOWER(n.name) LIKE ${championshipPattern})`
        : sql``
      const champFilter = championship
        ? sql`AND LOWER(e.championship) LIKE ${championshipPattern}`
        : sql``
      const dateFilter = date ? sql`AND DATE(e.starts_at) = ${date}` : sql``

      // ESC-05: a ordenação é (plano, próximo jogo, distância) e precisa de um
      // desempate único para virar chave de paginação — daí o `id` no fim.
      // O timestamp trafega como texto no formato do Postgres: `starts_at` é
      // `timestamp without time zone`, e converter para Date e de volta
      // deslocaria o valor pelo fuso local do processo.
      const planRankSql = sql`CASE n.plan WHEN 'elite' THEN 1 WHEN 'pro' THEN 2 ELSE 3 END`
      const keyset = cursor ? decodeCursor(cursor, searchCursorSchema) : null
      const keysetFilter = keyset
        ? sql`WHERE (${planRankSql}, agg.next_event_at, n.distance_km, n.id) >
              (${keyset.p}::int, ${keyset.e}::timestamp, ${keyset.d}::float8, ${keyset.i}::text)`
        : sql``

      const results = await db.execute(sql`
        WITH nearby AS (
          SELECT
            b.id,
            b.name,
            b.description,
            b.address,
            b.neighborhood,
            b.city,
            b.latitude,
            b.longitude,
            b.photo_url,
            b.created_at,
            COALESCE(s.plan, 'starter') AS plan,
            ST_Distance(b.geo, ${origin}) / 1000 AS distance_km
          FROM bar b
          LEFT JOIN subscription s ON s.bar_id = b.id
          WHERE b.is_active
            AND ST_DWithin(b.geo, ${origin}, ${radiusMeters})
        )
        SELECT
          n.*,
          agg.event_count,
          agg.next_event_at,
          ${planRankSql} AS cursor_plan_rank,
          to_char(agg.next_event_at, 'YYYY-MM-DD HH24:MI:SS.US') AS cursor_next_event_at,
          nxt.next_event_id,
          nxt.next_championship,
          nxt.next_event_starts_at,
          nxt.next_sport_name,
          nxt.next_sport_slug,
          nxt.next_participant_free_text,
          COALESCE(parts.next_participants, '[]'::json) AS next_participants
        FROM nearby n
        JOIN LATERAL (
          SELECT COUNT(*) AS event_count, MIN(e.starts_at) AS next_event_at
          FROM event e
          WHERE e.bar_id = n.id
            AND e.starts_at >= NOW()
            ${sportFilter}
            ${champBarFilter}
            ${dateFilter}
        ) agg ON agg.event_count > 0
        LEFT JOIN LATERAL (
          SELECT
            e.id AS next_event_id,
            e.championship AS next_championship,
            e.starts_at AS next_event_starts_at,
            s.name AS next_sport_name,
            s.slug AS next_sport_slug,
            e.participant_free_text AS next_participant_free_text
          FROM event e
          JOIN sport s ON s.id = e.sport_id
          WHERE e.bar_id = n.id
            AND e.starts_at >= NOW()
            ${sportFilter}
            ${champFilter}
            ${dateFilter}
          ORDER BY e.starts_at ASC
          LIMIT 1
        ) nxt ON true
        LEFT JOIN LATERAL (
          SELECT json_agg(json_build_object('name', t.name, 'logoUrl', t.logo_url)) AS next_participants
          FROM event_participants ep
          JOIN team t ON t.id = ep.team_id
          WHERE ep.event_id = nxt.next_event_id
        ) parts ON true
        ${keysetFilter}
        ORDER BY
          ${planRankSql} ASC,
          agg.next_event_at ASC,
          n.distance_km ASC,
          n.id ASC
        LIMIT ${limit}
      `)

      type RawRow = {
        id: string
        name: string
        description: string | null
        address: string | null
        neighborhood: string
        city: string
        latitude: string
        longitude: string
        photo_url: string | null
        created_at: string
        plan: 'starter' | 'pro' | 'elite'
        event_count: string
        next_event_at: string | null
        distance_km: number
        cursor_plan_rank: number
        cursor_next_event_at: string
        next_event_id: string | null
        next_championship: string | null
        next_event_starts_at: string | null
        next_sport_name: string | null
        next_sport_slug: string | null
        next_participant_free_text: string | null
        next_participants: { name: string; logoUrl: string | null }[]
      }

      const rows = results.rows as RawRow[]

      const bars = rows.map((row) => ({
        id: row.id,
        name: row.name,
        neighborhood: row.neighborhood,
        city: row.city,
        latitude: row.latitude,
        longitude: row.longitude,
        photo_url: row.photo_url,
        created_at: row.created_at,
        distance_km: row.distance_km,
        plan: row.plan,
        event_count: Number(row.event_count),
        nextEvent: row.next_event_id
          ? {
              id: row.next_event_id,
              championship: row.next_championship ?? '',
              startsAt: row.next_event_starts_at ?? '',
              sport: {
                name: row.next_sport_name ?? '',
                slug: row.next_sport_slug ?? ''
              },
              participants: row.next_participants.map((p) => ({
                team: { name: p.name, logoUrl: p.logoUrl }
              })),
              participantFreeText: row.next_participant_free_text
            }
          : undefined
      }))

      // Só oferece próxima página quando a atual encheu; a última linha vira
      // a chave de continuação.
      const last = rows.length === limit ? rows[rows.length - 1] : undefined

      return {
        bars,
        nextCursor: last
          ? encodeCursor({
              p: Number(last.cursor_plan_rank),
              e: last.cursor_next_event_at,
              d: last.distance_km,
              i: last.id
            })
          : null
      }
    }),

  /**
   * Perfil de um bar, para quem tem conta.
   *
   * Exige sessão de propósito, e isso NÃO é acidente de implementação: a
   * página só registra evento comercial quando há um fã identificado
   * (`actor_user_id` é obrigatório e sustenta a deduplicação diária e as
   * contagens de visitantes únicos e interessados). Visitante anônimo é
   * impossível de atribuir — abrir a página para ele deixaria passar tráfego
   * que nunca apareceria no painel que o bar paga para ver.
   *
   * O portão de login está especificado na própria tela, que renderiza o
   * diálogo de autenticação e marca o conteúdo como inerte sem sessão.
   *
   * `user_id` do dono e a coluna derivada `geo` ficam de fora da resposta, e
   * um bar inativo responde como inexistente.
   */
  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input }) => {
      const result = await db.query.bar.findFirst({
        where: eq(bar.id, input.id),
        // `geo` só serve ao índice espacial; `userId` identifica o dono e não
        // tem por que sair numa página pública.
        columns: { geo: false, userId: false },
        with: {
          events: {
            where: (event, { gte }) => gte(event.startsAt, new Date()),
            with: {
              sport: true,
              participants: {
                with: { team: true }
              }
            },
            orderBy: (event, { asc }) => [asc(event.startsAt)]
          }
        }
      })

      if (!result) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Bar não encontrado.'
        })
      }

      if (!result.isActive) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Bar não encontrado.'
        })
      }

      return result
    }),

  favorite: protectedProcedure
    .input(z.object({ barId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id

      if (ctx.session.user.role !== 'fan') {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Apenas torcedores podem favoritar bares.'
        })
      }

      await db
        .insert(userFavoriteBars)
        .values({ userId, barId: input.barId })
        .onConflictDoNothing()

      return { success: true }
    }),

  unfavorite: protectedProcedure
    .input(z.object({ barId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id

      if (ctx.session.user.role !== 'fan') {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Apenas torcedores podem favoritar bares.'
        })
      }

      await db
        .delete(userFavoriteBars)
        .where(
          sql`${userFavoriteBars.userId} = ${userId} AND ${userFavoriteBars.barId} = ${input.barId}`
        )

      return { success: true }
    }),

  isFavorited: protectedProcedure
    .input(z.object({ barId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      if (ctx.session.user.role !== 'fan') return { isFavorited: false }
      const result = await db.query.userFavoriteBars.findFirst({
        where: sql`${userFavoriteBars.userId} = ${ctx.session.user.id} AND ${userFavoriteBars.barId} = ${input.barId}`
      })
      return { isFavorited: !!result }
    }),

  getFavorites: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id

    if (ctx.session.user.role !== 'fan') {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Apenas torcedores podem acessar favoritos.'
      })
    }

    return db.query.userFavoriteBars.findMany({
      where: eq(userFavoriteBars.userId, userId),
      with: {
        bar: {
          columns: { geo: false },
          with: {
            events: {
              where: (event, { gte }) => gte(event.startsAt, new Date()),
              with: {
                sport: true,
                participants: { with: { team: true } }
              },
              orderBy: (event, { asc }) => [asc(event.startsAt)],
              limit: 3
            }
          }
        }
      }
    })
  }),

  getMyPreferences: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id

    if (ctx.session.user.role !== 'fan') {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Apenas torcedores têm preferências de esporte.'
      })
    }

    return db.query.userPreferenceSports.findMany({
      where: eq(userPreferenceSports.userId, userId),
      with: { sport: true }
    })
  }),

  updateMyPreferences: protectedProcedure
    .input(
      z.object({
        sportIds: z
          .array(z.string().uuid())
          .min(1, 'Selecione pelo menos 1 esporte.')
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id

      if (ctx.session.user.role !== 'fan') {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Apenas torcedores podem atualizar preferências.'
        })
      }

      await db.transaction(async (tx) => {
        await tx
          .delete(userPreferenceSports)
          .where(eq(userPreferenceSports.userId, userId))
        await tx
          .insert(userPreferenceSports)
          .values(input.sportIds.map((sportId) => ({ userId, sportId })))
          .onConflictDoNothing()
      })

      return { success: true }
    }),

  searchByLocation: protectedProcedure
    .input(
      z.object({
        lat: z.number(),
        lng: z.number(),
        radiusKm: z
          .union([z.literal(1), z.literal(3), z.literal(5), z.literal(10)])
          .default(5),
        cursor: z.string().optional(),
        limit: z.number().min(1).max(50).default(20)
      })
    )
    .query(async ({ input }) => {
      const { lat, lng, radiusKm, cursor, limit } = input
      const origin = sql`ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography`
      const radiusMeters = radiusKm * 1000

      // ESC-05: a chave de paginação usa o mesmo operador `<->` da ordenação,
      // e não `ST_Distance`, para não abrir mão da varredura ordenada pelo
      // índice GiST. `id` desempata bares equidistantes.
      const keyset = cursor ? decodeCursor(cursor, locationCursorSchema) : null
      const keysetFilter = keyset
        ? sql`AND (b.geo <-> ${origin}, b.id) > (${keyset.d}::float8, ${keyset.i}::text)`
        : sql``

      const results = await db.execute(sql`
        SELECT
          b.id,
          b.name,
          b.neighborhood,
          b.city,
          b.latitude,
          b.longitude,
          b.photo_url,
          b.created_at,
          ST_Distance(b.geo, ${origin}) / 1000 AS distance_km,
          b.geo <-> ${origin} AS cursor_dist
        FROM bar b
        WHERE b.is_active
          AND ST_DWithin(b.geo, ${origin}, ${radiusMeters})
          ${keysetFilter}
        ORDER BY b.geo <-> ${origin}, b.id
        LIMIT ${limit}
      `)

      type RawLocationRow = {
        id: string
        name: string
        neighborhood: string
        city: string
        latitude: string
        longitude: string
        photo_url: string | null
        created_at: string
        distance_km: number
        cursor_dist: number
      }

      const rows = results.rows as RawLocationRow[]

      const bars = rows.map((row) => ({
        id: row.id,
        name: row.name,
        neighborhood: row.neighborhood,
        city: row.city,
        latitude: row.latitude,
        longitude: row.longitude,
        photo_url: row.photo_url,
        created_at: row.created_at,
        distance_km: row.distance_km
      }))

      const last = rows.length === limit ? rows[rows.length - 1] : undefined

      return {
        bars,
        nextCursor: last
          ? encodeCursor({ d: last.cursor_dist, i: last.id })
          : null
      }
    }),

  getSports: protectedProcedure.query(async () => {
    return cacheEsportes.get('todos', () => db.select().from(sport))
  }),

  getTeamsBySport: protectedProcedure
    .input(z.object({ sportId: z.string().uuid() }))
    .query(async ({ input }) => {
      return cacheTimes.get(input.sportId, () =>
        db
          .select()
          .from(team)
          .where(eq(team.sportId, input.sportId))
          .orderBy(team.name)
      )
    }),
  getEliteEvents: protectedProcedure.query(async () => {
    return cacheDestaques.get('todos', async () => {
      const results = await db.execute(sql`
        SELECT
          b.name AS bar_name,
          e.championship,
          e.starts_at,
          s.name AS sport_name,
          b.neighborhood,
          b.city
        FROM event e
        JOIN bar b ON b.id = e.bar_id
        JOIN sport s ON s.id = e.sport_id
        JOIN subscription sub ON sub.bar_id = b.id
        WHERE
          b.is_active = true
          AND sub.plan = 'elite'
          AND e.starts_at >= NOW()
        ORDER BY e.starts_at ASC
        LIMIT 10
      `)
      return results.rows as Record<string, unknown>[]
    })
  })
})
