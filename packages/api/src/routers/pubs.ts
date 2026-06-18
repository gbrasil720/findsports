import { db, eq, sql } from '@findsports_oficial/db'
import {
  bar,
  sport,
  subscription,
  team,
  userFavoriteBars,
  userPreferenceSports
} from '@findsports_oficial/db/schema/platform'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import { protectedProcedure, publicProcedure, router } from '../index'

export const pubsRouter = router({
  search: publicProcedure
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
        cursor: z.number().default(0),
        limit: z.number().min(1).max(50).default(20)
      })
    )
    .query(async ({ input }) => {
      const { lat, lng, radiusKm, sportId, championship, date, cursor, limit } =
        input

      const uLat = sql.raw(String(lat))
      const uLng = sql.raw(String(lng))
      const uRadius = sql.raw(String(radiusKm))

      const sportFilter = sportId ? sql`AND e.sport_id = ${sportId}` : sql``
      const champFilter = championship
        ? sql`AND LOWER(e.championship) LIKE ${'%' + championship.toLowerCase() + '%'}`
        : sql``
      const champBarFilter = championship
        ? sql`AND (LOWER(e.championship) LIKE ${'%' + championship.toLowerCase() + '%'} OR LOWER(b.name) LIKE ${'%' + championship.toLowerCase() + '%'})`
        : sql``
      const dateFilter = date ? sql`AND DATE(e.starts_at) = ${date}` : sql``

      const results = await db.execute(sql`
        WITH bar_events AS (
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
            COUNT(DISTINCT e.id) AS event_count,
            MIN(e.starts_at) AS next_event_at,
            (6371 * acos(LEAST(1, GREATEST(-1,
              cos(radians(${uLat})) * cos(radians(b.latitude::float)) *
              cos(radians(b.longitude::float) - radians(${uLng})) +
              sin(radians(${uLat})) * sin(radians(b.latitude::float))
            )))) AS distance_km
          FROM bar b
          LEFT JOIN subscription s ON s.bar_id = b.id
          INNER JOIN event e ON e.bar_id = b.id
          LEFT JOIN event_participants ep ON ep.event_id = e.id
          WHERE
            b.is_active = true
            AND e.starts_at >= NOW()
            ${sportFilter}
            ${champBarFilter}
            ${dateFilter}
          GROUP BY b.id, b.name, b.description, b.address, b.neighborhood, b.city, b.latitude, b.longitude, b.photo_url, b.created_at, s.plan
        ),
        bar_next_event AS (
          SELECT DISTINCT ON (x.bar_id)
            x.bar_id,
            x.next_event_id,
            x.next_championship,
            x.next_event_starts_at,
            x.next_sport_name,
            x.next_sport_slug,
            x.next_participant_free_text,
            x.next_participants
          FROM (
            SELECT
              e.bar_id,
              e.id AS next_event_id,
              e.championship AS next_championship,
              e.starts_at AS next_event_starts_at,
              s.name AS next_sport_name,
              s.slug AS next_sport_slug,
              e.participant_free_text AS next_participant_free_text,
              COALESCE(
                json_agg(json_build_object('name', t.name, 'logoUrl', t.logo_url)) FILTER (WHERE t.id IS NOT NULL),
                '[]'::json
              ) AS next_participants
            FROM event e
            JOIN sport s ON s.id = e.sport_id
            LEFT JOIN event_participants ep ON ep.event_id = e.id
            LEFT JOIN team t ON t.id = ep.team_id
            WHERE e.starts_at >= NOW()
              ${sportFilter}
              ${champFilter}
              ${dateFilter}
            GROUP BY e.id, e.bar_id, e.championship, e.starts_at, s.name, s.slug, e.participant_free_text
          ) x
          ORDER BY x.bar_id, x.next_event_starts_at ASC
        )
        SELECT
          be.*,
          bne.next_event_id,
          bne.next_championship,
          bne.next_event_starts_at,
          bne.next_sport_name,
          bne.next_sport_slug,
          bne.next_participant_free_text,
          bne.next_participants
        FROM bar_events be
        LEFT JOIN bar_next_event bne ON bne.bar_id = be.id
        WHERE be.distance_km <= ${uRadius}
        ORDER BY
          CASE be.plan
            WHEN 'elite' THEN 1
            WHEN 'pro' THEN 2
            ELSE 3
          END ASC,
          be.next_event_at ASC,
          be.distance_km ASC
        LIMIT ${limit}
        OFFSET ${cursor}
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
        next_event_id: string | null
        next_championship: string | null
        next_event_starts_at: string | null
        next_sport_name: string | null
        next_sport_slug: string | null
        next_participant_free_text: string | null
        next_participants: { name: string; logoUrl: string | null }[]
      }

      const bars = (results.rows as RawRow[]).map((row) => ({
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

      return {
        bars,
        nextCursor: results.rows.length === limit ? cursor + limit : null
      }
    }),

  getById: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input }) => {
      const result = await db.query.bar.findFirst({
        where: eq(bar.id, input.id),
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

  searchByLocation: publicProcedure
    .input(
      z.object({
        lat: z.number(),
        lng: z.number(),
        radiusKm: z
          .union([z.literal(1), z.literal(3), z.literal(5), z.literal(10)])
          .default(5),
        cursor: z.number().default(0),
        limit: z.number().min(1).max(50).default(20)
      })
    )
    .query(async ({ input }) => {
      const { lat, lng, radiusKm, cursor, limit } = input
      const uLat = sql.raw(String(lat))
      const uLng = sql.raw(String(lng))
      const uRadius = sql.raw(String(radiusKm))

      const results = await db.execute(sql`
        SELECT * FROM (
          SELECT
            b.id,
            b.name,
            b.neighborhood,
            b.city,
            b.latitude,
            b.longitude,
            b.photo_url,
            b.created_at,
            (6371 * acos(LEAST(1, GREATEST(-1,
              cos(radians(${uLat})) * cos(radians(b.latitude::float)) *
              cos(radians(b.longitude::float) - radians(${uLng})) +
              sin(radians(${uLat})) * sin(radians(b.latitude::float))
            )))) AS distance_km
          FROM bar b
          WHERE b.is_active = true
        ) ranked
        WHERE distance_km <= ${uRadius}
        ORDER BY distance_km ASC
        LIMIT ${limit}
        OFFSET ${cursor}
      `)

      return {
        bars: results.rows,
        nextCursor: results.rows.length === limit ? cursor + limit : null
      }
    }),

  getSports: publicProcedure.query(async () => {
    return db.select().from(sport)
  }),

  getTeamsBySport: publicProcedure
    .input(z.object({ sportId: z.string().uuid() }))
    .query(async ({ input }) => {
      return db
        .select()
        .from(team)
        .where(eq(team.sportId, input.sportId))
        .orderBy(team.name)
    }),
  getEliteEvents: publicProcedure.query(async () => {
    const results = await db.execute(sql`
        SELECT
          b.name AS bar_name,
          e.championship,
          e.starts_at,
          s.name AS sport_name
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
    return results.rows
  })
})
