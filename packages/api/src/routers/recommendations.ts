import { db, sql } from '@findsports_oficial/db'
import {
  recommendationEvent,
  recommendationReset
} from '@findsports_oficial/db/schema/recommendation'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import { protectedProcedure, router } from '../index'
import { loadRecommendationCandidates } from '../lib/recommendations/load-candidates'
import {
  isQualityProtected,
  RECOMMENDATION_QUALITY_MIN_POSITIVE_RATE,
  RECOMMENDATION_QUALITY_MIN_SAMPLE,
  RECOMMENDATION_QUALITY_WINDOW_DAYS,
  RECOMMENDATION_REASONS,
  rankRecommendations,
  type ScoredRecommendation
} from '../lib/recommendations/ranking'

const coordinatesSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180)
})

const runEventSchema = z.object({
  runId: z.string().uuid(),
  barId: z.string().uuid()
})

function assertFan(role: string): void {
  if (role !== 'fan') {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Apenas torcedores recebem sugestões personalizadas.'
    })
  }
}

function normalizedRadius(value: number): 1 | 3 | 5 | 10 {
  return value === 1 || value === 3 || value === 5 || value === 10 ? value : 3
}

function reasonLabel(item: ScoredRecommendation): string {
  switch (item.reason) {
    case 'recent_interest':
      return 'Você demonstrou interesse neste bar'
    case 'preferred_sport':
      return item.bar.matchedSportName
        ? `Tem jogos de ${item.bar.matchedSportName}, um dos seus esportes`
        : 'Tem jogos de um dos seus esportes'
    case 'similar_experience':
      return 'Experiência parecida com seus favoritos'
    case 'well_rated':
      return 'Bem avaliado por quem foi assistir'
    case 'nearby':
      return 'Perto de você'
    case 'explore':
      return 'Uma experiência diferente para explorar'
  }
}

export const recommendationsRouter = router({
  get: protectedProcedure
    .input(coordinatesSchema)
    .query(async ({ ctx, input }) => {
      assertFan(ctx.session.user.role)
      const now = new Date()
      const radiusKm = normalizedRadius(ctx.session.user.searchRadiusKm)
      const candidates = await loadRecommendationCandidates({
        userId: ctx.session.user.id,
        lat: input.lat,
        lng: input.lng,
        radiusKm,
        now
      })
      const ranked = rankRecommendations(candidates, { now, radiusKm })

      return {
        runId: crypto.randomUUID(),
        radiusKm,
        recommendations: ranked.map((item) => ({
          bar: {
            id: item.bar.id,
            name: item.bar.name,
            neighborhood: item.bar.neighborhood,
            city: item.bar.city,
            latitude: item.bar.latitude,
            longitude: item.bar.longitude,
            photoUrl: item.bar.photoUrl,
            distanceKm: item.bar.distanceKm,
            eventCount: item.bar.eventCount,
            nextEvent: item.bar.nextEvent
          },
          reason: item.reason,
          reasonLabel: reasonLabel(item),
          isExpandedRadius: item.isExpandedRadius
        }))
      }
    }),

  recordImpressions: protectedProcedure
    .input(
      z.object({
        runId: z.string().uuid(),
        items: z
          .array(
            z.object({
              barId: z.string().uuid(),
              position: z.number().int().min(1).max(3),
              reason: z.enum(RECOMMENDATION_REASONS),
              expandedRadius: z.boolean()
            })
          )
          .min(1)
          .max(3)
      })
    )
    .mutation(async ({ ctx, input }) => {
      assertFan(ctx.session.user.role)
      await db
        .insert(recommendationEvent)
        .values(
          input.items.map((item) => ({
            actorUserId: ctx.session.user.id,
            barId: item.barId,
            runId: input.runId,
            type: 'impression' as const,
            position: item.position,
            reason: item.reason,
            expandedRadius: item.expandedRadius
          }))
        )
        .onConflictDoNothing()
      return { success: true }
    }),

  recordOpen: protectedProcedure
    .input(runEventSchema)
    .mutation(async ({ ctx, input }) => {
      assertFan(ctx.session.user.role)
      await db
        .insert(recommendationEvent)
        .values({
          actorUserId: ctx.session.user.id,
          barId: input.barId,
          runId: input.runId,
          type: 'open'
        })
        .onConflictDoNothing()
      return { success: true }
    }),

  dismiss: protectedProcedure
    .input(runEventSchema)
    .mutation(async ({ ctx, input }) => {
      assertFan(ctx.session.user.role)
      const result = await db.execute(sql`
        WITH inserted AS (
          INSERT INTO recommendation_event (
            id, actor_user_id, bar_id, run_id, type, occurred_at, created_at
          )
          SELECT
            ${crypto.randomUUID()}, ${ctx.session.user.id}, b.id, ${input.runId},
            'dismiss', NOW(), NOW()
          FROM bar b
          WHERE b.id = ${input.barId} AND b.is_active
          ON CONFLICT DO NOTHING
          RETURNING id
        )
        SELECT id FROM inserted
        UNION ALL
        SELECT re.id
        FROM recommendation_event re
        WHERE re.actor_user_id = ${ctx.session.user.id}
          AND re.bar_id = ${input.barId}
          AND re.run_id = ${input.runId}
          AND re.type = 'dismiss'
        LIMIT 1
      `)
      if (result.rows.length === 0) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Sugestão não encontrada.'
        })
      }
      return { success: true }
    }),

  reset: protectedProcedure.mutation(async ({ ctx }) => {
    assertFan(ctx.session.user.role)
    const now = new Date()
    await db.transaction(async (tx) => {
      await tx
        .insert(recommendationReset)
        .values({ actorUserId: ctx.session.user.id, resetAt: now })
        .onConflictDoUpdate({
          target: recommendationReset.actorUserId,
          set: { resetAt: now, updatedAt: now }
        })
      await tx.insert(recommendationEvent).values({
        actorUserId: ctx.session.user.id,
        type: 'reset',
        occurredAt: now
      })
    })
    return { success: true }
  }),

  getMyBarQualityStatus: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.session.user.role !== 'pub') {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Apenas contas de bar acessam este status.'
      })
    }
    const rows = await db.execute(sql`
      SELECT
        b.is_active,
        COUNT(r.id)::int AS recent_rating_count,
        COUNT(r.id) FILTER (WHERE r.would_return)::int AS recent_rating_positive
      FROM bar b
      LEFT JOIN bar_rating r
        ON r.bar_id = b.id
        AND r.updated_at >= NOW() - ${RECOMMENDATION_QUALITY_WINDOW_DAYS} * INTERVAL '1 day'
      WHERE b.user_id = ${ctx.session.user.id}
      GROUP BY b.id, b.is_active
    `)
    const row = rows.rows[0] as
      | {
          is_active: boolean
          recent_rating_count: number | string
          recent_rating_positive: number | string
        }
      | undefined
    if (!row) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Bar não encontrado.' })
    }
    const recentRatingCount = Number(row.recent_rating_count)
    const recentRatingPositive = Number(row.recent_rating_positive)
    const protectedByQuality = isQualityProtected(
      recentRatingCount,
      recentRatingPositive
    )
    return {
      commerciallyEligible: row.is_active,
      eligible: row.is_active && !protectedByQuality,
      protectedByQuality,
      recentRatingCount,
      recentPositivePercentage:
        recentRatingCount === 0
          ? null
          : Math.round((recentRatingPositive / recentRatingCount) * 100),
      minimumSample: RECOMMENDATION_QUALITY_MIN_SAMPLE,
      minimumPositivePercentage: RECOMMENDATION_QUALITY_MIN_POSITIVE_RATE * 100,
      windowDays: RECOMMENDATION_QUALITY_WINDOW_DAYS
    }
  })
})
