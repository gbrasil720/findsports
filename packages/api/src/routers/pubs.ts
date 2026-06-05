import { db, eq, sql } from '@findsports_oficial/db'
import {
  bar,
  team,
  userFavoriteBars
} from '@findsports_oficial/db/schema/platform'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import { protectedProcedure, publicProcedure, router } from '../index'
import { haversineSQL } from '../lib/haversine-sql'

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

      const distance = haversineSQL(lat, lng, 'b')

      const results = await db.execute(sql`
        SELECT DISTINCT
          b.id,
          b.name,
          b.description,
          b.address,
          b.neighborhood,
          b.city,
          b.latitude,
          b.longitude,
          b.photo_url,
          ${distance} AS distance_km
        FROM bar b
        INNER JOIN event e ON e.bar_id = b.id
        LEFT JOIN event_participants ep ON ep.event_id = e.id
        WHERE
          b.is_active = true
          AND e.starts_at >= NOW()
          ${sportId ? sql`AND e.sport_id = ${sportId}` : sql``}
          ${championship ? sql`AND LOWER(e.championship) LIKE ${'%' + championship.toLowerCase() + '%'}` : sql``}
          ${date ? sql`AND DATE(e.starts_at) = ${date}` : sql``}
          AND ${distance} <= ${radiusKm}
        ORDER BY distance_km ASC
        LIMIT ${limit}
        OFFSET ${cursor}
      `)

      return {
        bars: results.rows,
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
              with: { sport: true },
              orderBy: (event, { asc }) => [asc(event.startsAt)],
              limit: 3
            }
          }
        }
      }
    })
  }),
  getSports: publicProcedure.query(async () => {
    const { sport } = await import('@findsports_oficial/db/schema/platform')
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
    })
})
