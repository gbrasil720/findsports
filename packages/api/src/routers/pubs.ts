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
import { getAppConfig } from '../lib/app-config'
import { EVENT_LIVE_WINDOW_MS } from '../lib/event-profile-window'
import { decodeCursor, encodeCursor } from '../lib/keyset-cursor'
import {
  executarBuscaEmCamadas,
  executarBuscaLinear,
  type SearchPage
} from '../lib/pub-search'
import { chaveBusca, chaveBuscaLocal } from '../lib/search-cache'
import { createSharedCache } from '../lib/shared-cache'

/**
 * ESC-08: catálogos e buscas são iguais para todo mundo. Sem KV o cache
 * vive na instância; com Upstash/Vercel KV as instâncias passam a
 * compartilhar. Nada derivado de sessão entra aqui.
 */
const CATALOGO_TTL_MS = 5 * 60_000
/** Jogos em destaque e busca dependem de NOW(); janela curta. */
const BUSCA_TTL_MS = 60_000

const cacheEsportes = createSharedCache<(typeof sport.$inferSelect)[]>({
  prefix: 'pubs.sports',
  ttlMs: CATALOGO_TTL_MS
})
const cacheTimes = createSharedCache<(typeof team.$inferSelect)[]>({
  prefix: 'pubs.teams',
  ttlMs: CATALOGO_TTL_MS,
  maxEntries: 50
})
const cacheDestaques = createSharedCache<Record<string, unknown>[]>({
  prefix: 'pubs.elite',
  ttlMs: BUSCA_TTL_MS
})
const cacheBusca = createSharedCache<SearchPage>({
  prefix: 'pubs.search',
  ttlMs: BUSCA_TTL_MS,
  maxEntries: 200
})
const cacheLocal = createSharedCache<LocationPage>({
  prefix: 'pubs.location',
  ttlMs: BUSCA_TTL_MS,
  maxEntries: 200
})

/** Última tupla de ordenação de `searchByLocation`: distância e id. */
const locationCursorSchema = z.object({
  d: z.number(),
  i: z.string()
})

type LocationBar = {
  id: string
  name: string
  neighborhood: string
  city: string
  latitude: string
  longitude: string
  photo_url: string | null
  created_at: string
  distance_km: number
}

type LocationPage = { bars: LocationBar[]; nextCursor: string | null }

type LocationInput = {
  lat: number
  lng: number
  radiusKm: 1 | 3 | 5 | 10
  cursor?: string
  limit: number
}

async function executarBuscaLocal(input: LocationInput): Promise<LocationPage> {
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
    nextCursor: last ? encodeCursor({ d: last.cursor_dist, i: last.id }) : null
  }
}

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
      const emCamadas = await getAppConfig('search.tiered_plan_query')
      const executar = emCamadas ? executarBuscaEmCamadas : executarBuscaLinear
      return cacheBusca.get(
        chaveBusca({ ...input, modo: emCamadas ? 'camadas' : 'linear' }),
        () => executar(input)
      )
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
    .query(async ({ ctx, input }) => {
      const now = new Date()
      const liveCutoff = new Date(now.getTime() - EVENT_LIVE_WINDOW_MS)

      const result = await db.query.bar.findFirst({
        where: eq(bar.id, input.id),
        // `geo` só serve ao índice espacial. `userId` é lido para reconhecer o
        // dono e descartado antes da resposta — quem visita não precisa saber
        // qual conta é dona do bar.
        columns: { geo: false },
        with: {
          events: {
            // Jogo ao vivo continua na página: o corte é o fim provável do
            // jogo, não o início. Ver `event-profile-window.ts`.
            //
            // O predicado é montado com operadores do Drizzle, e não com SQL
            // cru: `event.starts_at` é `timestamp` sem fuso, e comparar com
            // `now()` (que é `timestamptz`) faria o Postgres converter usando
            // o fuso da sessão — a janela mudaria de tamanho conforme o
            // servidor. Com os operadores, o valor viaja pelo tipo da coluna.
            where: (event, { and, gte, isNotNull, isNull, or }) =>
              or(
                and(isNotNull(event.endsAt), gte(event.endsAt, now)),
                and(isNull(event.endsAt), gte(event.startsAt, liveCutoff))
              ),
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

      // O dono vê a própria página com avisos que ninguém mais vê — o que
      // falta preencher, e quanto isso custa em contatos. Quem decide é o
      // servidor: o cliente não tem como comparar sem receber o `userId`.
      const { userId, ...publicBar } = result

      return { ...publicBar, isOwner: userId === ctx.session.user.id }
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
      return cacheLocal.get(chaveBuscaLocal(input), () =>
        executarBuscaLocal(input)
      )
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
        WHERE
          b.is_active = true
          AND b.plan = 'elite'
          AND e.starts_at >= NOW()
        ORDER BY e.starts_at ASC
        LIMIT 10
      `)
      return results.rows as Record<string, unknown>[]
    })
  })
})
