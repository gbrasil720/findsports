import { and, db, eq, inArray, sql } from '@findsports_oficial/db'
import { eventNotEndedSql } from '@findsports_oficial/db/event-window-sql'
import { userFavoriteBars } from '@findsports_oficial/db/schema/platform'
import {
  barGameAlert,
  gameReminder,
  recommendationEvent,
  recommendationReset
} from '@findsports_oficial/db/schema/recommendation'
import { clampSearchRadiusKm } from '@findsports_oficial/db/search-radius'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import { fanProcedure, pubProcedure, router } from '../index'
import { participantNames } from '../lib/game-participants'
import { loadRecommendationCandidates } from '../lib/recommendations/load-candidates'
import {
  isQualityProtected,
  RECOMMENDATION_MAX_COUNT,
  RECOMMENDATION_QUALITY_MIN_POSITIVE_RATE,
  RECOMMENDATION_QUALITY_MIN_SAMPLE,
  RECOMMENDATION_QUALITY_WINDOW_DAYS,
  RECOMMENDATION_REASONS,
  rankRecommendations,
  type ScoredRecommendation
} from '../lib/recommendations/ranking'
import { ROUND_SIZE } from '../lib/recommendations/round'
import {
  hydrateRound,
  readExpansion,
  readOrCreateRound,
  readTodayRound,
  refillRound
} from '../lib/recommendations/round-store'
import { utcIso } from '../lib/utc-timestamp'

const coordinatesSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180)
})

const runEventSchema = z.object({
  runId: z.string().uuid(),
  barId: z.string().uuid()
})

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

/** O bar está numa rodada deste torcedor? Curti e Voltar só valem nela. */
async function assertInRound(userId: string, runId: string, barId: string) {
  const rows = await db.execute(sql`
    SELECT 1 FROM recommendation_round
    WHERE run_id = ${runId}
      AND actor_user_id = ${userId}
      AND items @> ${JSON.stringify([{ barId }])}::jsonb
  `)
  if (rows.rows.length === 0) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Sugestão não encontrada.'
    })
  }
}

export const recommendationsRouter = router({
  get: fanProcedure.input(coordinatesSchema).query(async ({ ctx, input }) => {
    const now = new Date()
    const radiusKm = clampSearchRadiusKm(ctx.session.user.searchRadiusKm, 3)
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

  recordImpressions: fanProcedure
    .input(
      z.object({
        runId: z.string().uuid(),
        items: z
          .array(
            z.object({
              barId: z.string().uuid(),
              position: z.number().int().min(1).max(RECOMMENDATION_MAX_COUNT),
              reason: z.enum(RECOMMENDATION_REASONS),
              expandedRadius: z.boolean()
            })
          )
          .min(1)
          .max(RECOMMENDATION_MAX_COUNT)
      })
    )
    .mutation(async ({ ctx, input }) => {
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

  recordOpen: fanProcedure
    .input(runEventSchema)
    .mutation(async ({ ctx, input }) => {
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

  dismiss: fanProcedure
    .input(runEventSchema)
    .mutation(async ({ ctx, input }) => {
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

  reset: fanProcedure.mutation(async ({ ctx }) => {
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

  /**
   * "Bares pra você" (WEB-425): a rodada de hoje, até cinco bares, a mesma
   * o dia todo. Sem rodada e sem localização volta `null` (a tela pede a
   * localização, 23k). A rodada vira às 10:00 de Brasília.
   */
  today: fanProcedure
    .input(z.object({ where: coordinatesSchema.nullable() }))
    .query(async ({ ctx, input }) => {
      const now = new Date()
      const round = await readOrCreateRound({
        userId: ctx.session.user.id,
        userRadiusKm: ctx.session.user.searchRadiusKm,
        where: input.where,
        now
      })
      return {
        userRadiusKm: clampSearchRadiusKm(ctx.session.user.searchRadiusKm, 3),
        round: round
          ? await hydrateRound(ctx.session.user.id, round, now)
          : null
      }
    }),

  /** Rodada curta ou vazia: quanto rende ampliar o raio (23h, 23i). */
  expansion: fanProcedure
    .input(coordinatesSchema)
    .query(async ({ ctx, input }) => {
      const now = new Date()
      const round = await readTodayRound(ctx.session.user.id, now)
      return readExpansion({
        userId: ctx.session.user.id,
        where: input,
        radiusKm:
          round?.radiusKm ??
          clampSearchRadiusKm(ctx.session.user.searchRadiusKm, 3),
        exclude: round?.items.map((item) => item.barId) ?? [],
        now
      })
    }),

  /** "Ampliar para 10 km": completa a rodada de hoje até cinco. */
  refill: fanProcedure
    .input(
      z.object({
        where: coordinatesSchema,
        radiusKm: z.number().int().min(1).max(50)
      })
    )
    .mutation(async ({ ctx, input }) => {
      const round = await refillRound({
        userId: ctx.session.user.id,
        userRadiusKm: ctx.session.user.searchRadiusKm,
        where: input.where,
        radiusKm: input.radiusKm,
        now: new Date()
      })
      return { size: round?.items.length ?? 0, max: ROUND_SIZE }
    }),

  /**
   * "Curti" (23b): salva em Seus bares e conta como intenção forte nas
   * próximas rodadas (o `favorite` da rodada entra como `high_intent`).
   */
  like: fanProcedure.input(runEventSchema).mutation(async ({ ctx, input }) => {
    const userId = ctx.session.user.id
    await assertInRound(userId, input.runId, input.barId)
    await db.transaction(async (tx) => {
      await tx
        .insert(userFavoriteBars)
        .values({ userId, barId: input.barId })
        .onConflictDoNothing()
      await tx
        .delete(recommendationEvent)
        .where(
          and(
            eq(recommendationEvent.actorUserId, userId),
            eq(recommendationEvent.runId, input.runId),
            eq(recommendationEvent.barId, input.barId),
            eq(recommendationEvent.type, 'dismiss')
          )
        )
      await tx
        .insert(recommendationEvent)
        .values({
          actorUserId: userId,
          barId: input.barId,
          runId: input.runId,
          type: 'favorite'
        })
        .onConflictDoNothing()
    })
    return { success: true }
  }),

  /**
   * "Voltar" (23a): desfaz o último Curti ou Passo. Desfazer o Curti tira o
   * bar dos salvos sem o resfriamento do desfavoritar.
   */
  undo: fanProcedure.input(runEventSchema).mutation(async ({ ctx, input }) => {
    const userId = ctx.session.user.id
    await assertInRound(userId, input.runId, input.barId)
    await db.transaction(async (tx) => {
      const removed = await tx
        .delete(recommendationEvent)
        .where(
          and(
            eq(recommendationEvent.actorUserId, userId),
            eq(recommendationEvent.runId, input.runId),
            eq(recommendationEvent.barId, input.barId),
            inArray(recommendationEvent.type, ['favorite', 'dismiss'])
          )
        )
        .returning({ type: recommendationEvent.type })
      // ponytail: se a pessoa salvou o bar por outro caminho entre o Curti
      // e o Voltar, ele sai dos salvos também.
      if (removed.some((row) => row.type === 'favorite')) {
        await tx
          .delete(userFavoriteBars)
          .where(
            and(
              eq(userFavoriteBars.userId, userId),
              eq(userFavoriteBars.barId, input.barId)
            )
          )
      }
    })
    return { success: true }
  }),

  /**
   * "Avisar" (23e): quando o bar publicar um jogo do esporte (ou do time), o
   * aviso aparece em Avisos (`notices`). Sem push (WEB-416).
   */
  setAlert: fanProcedure
    .input(
      z
        .object({
          barId: z.string().uuid(),
          sportId: z.string().uuid().optional(),
          teamId: z.string().uuid().optional(),
          on: z.boolean(),
          runId: z.string().uuid().optional()
        })
        .refine((value) => Boolean(value.sportId) !== Boolean(value.teamId), {
          message: 'Escolha um esporte ou um time.'
        })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id
      if (input.on) {
        await db
          .insert(barGameAlert)
          .values({
            userId,
            barId: input.barId,
            sportId: input.sportId ?? null,
            teamId: input.teamId ?? null,
            runId: input.runId ?? null
          })
          .onConflictDoNothing()
      } else {
        await db.execute(sql`
          DELETE FROM bar_game_alert
          WHERE user_id = ${userId}
            AND bar_id = ${input.barId}
            AND sport_id IS NOT DISTINCT FROM ${input.sportId ?? null}
            AND team_id IS NOT DISTINCT FROM ${input.teamId ?? null}
        `)
      }
      return { success: true }
    }),

  /** "Lembrar" (23c): o aviso aparece em Avisos no dia do jogo. */
  remind: fanProcedure
    .input(
      z.object({
        eventId: z.string().uuid(),
        on: z.boolean(),
        runId: z.string().uuid().optional(),
        /** Sem ele, o lembrete vale o dia do jogo inteiro. */
        beforeMinutes: z.number().int().min(1).max(1440).optional()
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id
      if (input.on) {
        const remindBeforeMinutes = input.beforeMinutes ?? null
        await db
          .insert(gameReminder)
          .values({
            userId,
            eventId: input.eventId,
            runId: input.runId,
            remindBeforeMinutes
          })
          .onConflictDoUpdate({
            target: [gameReminder.userId, gameReminder.eventId],
            set: { remindBeforeMinutes }
          })
      } else {
        await db
          .delete(gameReminder)
          .where(
            and(
              eq(gameReminder.userId, userId),
              eq(gameReminder.eventId, input.eventId)
            )
          )
      }
      return { success: true }
    }),

  /**
   * Os avisos de "Avisar" e "Lembrar" para a tela de Avisos do app: jogo
   * publicado depois do pedido que case com o esporte ou o time, e os
   * jogos lembrados que ainda não acabaram. O app mostra o lembrete no dia
   * do jogo, ou a partir de `remindBeforeMinutes` antes dele.
   */
  notices: fanProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id
    const now = new Date()
    const [alerts, reminders] = await Promise.all([
      db.execute(sql`
        SELECT DISTINCT ON (e.id)
          e.id AS event_id, e.starts_at, e.created_at, e.championship,
          e.participant_free_text,
          ${participantNames(sql`e.id`)} AS participants,
          b.id AS bar_id, b.name AS bar_name,
          s.name AS sport_name, t.name AS team_name
        FROM bar_game_alert a
        JOIN bar b ON b.id = a.bar_id AND b.is_active
        JOIN event e ON e.bar_id = a.bar_id AND e.created_at >= a.created_at
        JOIN sport s ON s.id = e.sport_id
        LEFT JOIN team t ON t.id = a.team_id
        WHERE a.user_id = ${userId}
          AND e.published_at IS NOT NULL
          AND ${eventNotEndedSql('e', now)}
          AND (
            a.sport_id = e.sport_id
            OR EXISTS (
              SELECT 1 FROM event_participants ep
              WHERE ep.event_id = e.id AND ep.team_id = a.team_id
            )
          )
        ORDER BY e.id, a.team_id NULLS LAST
      `),
      db.execute(sql`
        SELECT
          e.id AS event_id, e.starts_at, e.championship, e.participant_free_text,
          ${participantNames(sql`e.id`)} AS participants,
          b.id AS bar_id, b.name AS bar_name,
          r.remind_before_minutes
        FROM game_reminder r
        JOIN event e ON e.id = r.event_id
        JOIN bar b ON b.id = e.bar_id AND b.is_active
        WHERE r.user_id = ${userId}
          AND e.published_at IS NOT NULL
          AND ${eventNotEndedSql('e', now)}
      `)
    ])
    type Row = {
      event_id: string
      starts_at: string
      created_at?: string
      championship: string
      participant_free_text: string | null
      participants: string[]
      bar_id: string
      bar_name: string
      sport_name?: string
      team_name?: string | null
      remind_before_minutes?: number | null
    }
    const game = (row: Row) => ({
      eventId: row.event_id,
      startsAt: utcIso(row.starts_at),
      championship: row.championship,
      participantFreeText: row.participant_free_text,
      participants: row.participants,
      barId: row.bar_id,
      barName: row.bar_name
    })
    return {
      alerts: (alerts.rows as Row[]).map((row) => ({
        ...game(row),
        publishedAt: utcIso(row.created_at ?? row.starts_at),
        sportName: row.sport_name ?? '',
        teamName: row.team_name ?? null
      })),
      reminders: (reminders.rows as Row[]).map((row) => ({
        ...game(row),
        remindBeforeMinutes: row.remind_before_minutes ?? null
      }))
    }
  }),

  /**
   * Os bairros com mais bares perto de um ponto, para "escolha um bairro"
   * (23k, 23i), com o centro de cada um: dá para buscar sem geocodificar.
   */
  places: fanProcedure.input(coordinatesSchema).query(async ({ input }) => {
    const rows = await db.execute(sql`
      SELECT
        b.neighborhood AS name,
        AVG(b.latitude::double precision) AS lat,
        AVG(b.longitude::double precision) AS lng
      FROM bar b
      WHERE b.is_active
        AND b.neighborhood <> ''
        AND ST_DWithin(
          b.geo,
          ST_SetSRID(ST_MakePoint(${input.lng}, ${input.lat}), 4326)::geography,
          25000
        )
      GROUP BY b.neighborhood
      ORDER BY COUNT(*) DESC, b.neighborhood
      LIMIT 5
    `)
    return (rows.rows as { name: string; lat: number; lng: number }[]).map(
      (row) => ({ name: row.name, lat: Number(row.lat), lng: Number(row.lng) })
    )
  }),

  getMyBarQualityStatus: pubProcedure.query(async ({ ctx }) => {
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
