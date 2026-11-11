import { recordAdminActionSafely } from '@findsports_oficial/db/admin-action'
import {
  brasiliaDay,
  brasiliaDayStart
} from '@findsports_oficial/db/event-window'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { adminProcedure, pubProcedure, router } from '../index'
import {
  applyEventBreakdownEntitlements,
  applyOverviewEntitlements,
  assertAnalyticsPeriodAllowed,
  getAnalyticsEntitlements,
  getComparisonMetrics,
  getMonthNumbers,
  getMyAnalyticsOverview,
  getMyEventAnalytics,
  getWeekdayInterest,
  resolveBarAndPlan,
  runAndRecordAnalyticsRetention,
  WEEKDAY_INTEREST_WEEKS
} from '../lib/commercial-analytics'

const DAY_MS = 24 * 60 * 60 * 1000
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export const analyticsDateSchema = z
  .string()
  .datetime({ offset: true })
  .or(z.string().date())

export const comparisonTargetSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('events'),
    eventIds: z.array(z.string().uuid()).min(1).max(20)
  }),
  z.object({
    type: z.literal('event_to_bar'),
    eventId: z.string().uuid()
  })
])

function nextDate(date: string): string {
  const next = new Date(`${date}T00:00:00.000Z`)
  next.setUTCDate(next.getUTCDate() + 1)
  return next.toISOString().slice(0, 10)
}

export function parseAnalyticsRange(input: { from: string; to: string }): {
  from: Date
  to: Date
  periodDays: number
} {
  const from = DATE_ONLY_PATTERN.test(input.from)
    ? brasiliaDayStart(input.from)
    : new Date(input.from)
  const to = DATE_ONLY_PATTERN.test(input.to)
    ? new Date(brasiliaDayStart(nextDate(input.to)).getTime() - 1)
    : new Date(input.to)

  if (from.getTime() > to.getTime()) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'O início do período deve ser anterior ao fim.'
    })
  }

  return {
    from,
    to,
    periodDays: Math.max(1, Math.ceil((to.getTime() - from.getTime()) / DAY_MS))
  }
}

export const commercialAnalyticsRouter = router({
  /**
   * Get analytics overview for the authenticated pub's bar.
   * Tenant-safe: bar derived from session.
   */
  getMyAnalyticsOverview: pubProcedure
    .input(
      z.object({
        from: analyticsDateSchema,
        to: analyticsDateSchema
      })
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id

      const { barId, plan } = await resolveBarAndPlan(userId)
      const entitlements = getAnalyticsEntitlements(plan)

      if (!entitlements.canViewAnalytics) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Plano não permite analytics'
        })
      }

      const { from, to, periodDays } = parseAnalyticsRange(input)

      assertAnalyticsPeriodAllowed(plan, periodDays)

      const overview = await getMyAnalyticsOverview(barId, from, to)

      // Server-side entitlement filtering. The response is shaped field by
      // field (never by spreading the raw overview), so a plan blocked from
      // comparison cannot leak `*Prev`/`*Change` values.
      return {
        ...applyOverviewEntitlements(overview, entitlements),
        plan,
        entitlements
      }
    }),

  /**
   * Get per-event analytics for the authenticated pub's bar.
   * Tenant-safe: events filtered by bar derived from session.
   */
  getMyEventAnalytics: pubProcedure
    .input(
      z.object({
        from: analyticsDateSchema,
        to: analyticsDateSchema,
        comparisonTarget: comparisonTargetSchema.optional()
      })
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id

      const { barId, plan } = await resolveBarAndPlan(userId)
      const entitlements = getAnalyticsEntitlements(plan)

      if (entitlements.eventBreakdown === 'none') {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Plano não permite analytics por jogo'
        })
      }

      const { from, to, periodDays } = parseAnalyticsRange(input)

      assertAnalyticsPeriodAllowed(plan, periodDays)

      if (
        input.comparisonTarget &&
        entitlements.comparison === 'previous_period'
      ) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Seu plano não permite comparação entre jogos'
        })
      }

      const result = await getMyEventAnalytics(barId, from, to, {
        comparisonTarget: input.comparisonTarget,
        comparisonMode:
          entitlements.comparison === 'advanced' ? 'advanced' : 'cross_game',
        comparisonMetrics: getComparisonMetrics(entitlements)
      })

      // O servidor filtra as métricas por entitlement — as que o plano não
      // enxerga vêm nulas, nunca vazam o valor (mesma regra do overview).
      return applyEventBreakdownEntitlements(result, entitlements)
    }),

  /**
   * O mês do bar em Plano e cobrança (3o, 3q; WEB-446): presenças marcadas,
   * códigos validados e clássicos no topo. O que o plano não enxerga vem
   * nulo, pela mesma regra do analytics por jogo e do overview.
   */
  getMyMonthNumbers: pubProcedure.query(async ({ ctx }) => {
    const { barId, plan } = await resolveBarAndPlan(ctx.session.user.id)
    const entitlements = getAnalyticsEntitlements(plan)
    const month = await getMonthNumbers(barId)
    return {
      going: entitlements.canViewReservations ? month.going : null,
      validatedCodes: entitlements.canViewReservations
        ? month.validatedCodes
        : null,
      classicsOnTop: entitlements.canViewClassicPlacement
        ? month.classicsOnTop
        : null
    }
  }),

  /**
   * Interesse do dia contra o normal do mesmo dia da semana (Hoje, 1r;
   * WEB-449). `day` é o dia da casa que a tela mostra; a janela vai da
   * meia-noite dele até agora, e as quatro semanas de antes cabem no
   * histórico de todos os planos.
   */
  getMyWeekdayInterest: pubProcedure
    .input(z.object({ day: z.string().date() }))
    .query(async ({ ctx, input }) => {
      const now = new Date()
      if (input.day > brasiliaDay(now)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'O dia ainda não começou.'
        })
      }
      const { barId, plan } = await resolveBarAndPlan(ctx.session.user.id)
      const desde =
        brasiliaDayStart(input.day).getTime() -
        WEEKDAY_INTEREST_WEEKS * 7 * DAY_MS
      assertAnalyticsPeriodAllowed(
        plan,
        Math.ceil((now.getTime() - desde) / DAY_MS)
      )
      return getWeekdayInterest(barId, input.day, now)
    }),

  /**
   * Get entitlements for the authenticated pub's plan.
   */
  getMyEntitlements: pubProcedure.query(async ({ ctx }) => {
    const { plan } = await resolveBarAndPlan(ctx.session.user.id)
    return getAnalyticsEntitlements(plan)
  }),

  /**
   * Admin: retenção de analytics (ESC-10).
   *
   * Consolida os rollups de dias fechados e, opcionalmente, poda os eventos
   * brutos já consolidados. A consolidação sempre roda; a poda exige
   * `apagarEventosBrutos: true` explícito. Rollups nunca são apagados — são o
   * registro de longo prazo, e a versão anterior desta rotina apagava
   * justamente eles.
   *
   * WEB-117: a execução diária vem do Cron Trigger do Worker (`scheduled()`
   * em `apps/web/src/worker.ts`); esta mutation fica para rodar à mão. As duas gravam a execução em
   * `analytics_retention_run`.
   */
  cleanupRetention: adminProcedure
    .input(
      z.object({
        days: z.number().int().min(1).max(365).default(90),
        // ESC-10: consolidar sempre; apagar só se pedido explicitamente.
        apagarEventosBrutos: z.boolean().default(false)
      })
    )
    .mutation(async ({ ctx, input }) => {
      const result = await runAndRecordAnalyticsRetention({
        trigger: 'admin',
        retentionDays: input.days,
        apagarEventosBrutos: input.apagarEventosBrutos
      })
      // WEB-384: apagar eventos brutos é ação de admin como as do Houdini.
      await recordAdminActionSafely({
        kind: 'system.run_job',
        actorId: ctx.session.user.id,
        actorName: ctx.session.user.name,
        targetType: 'job',
        targetId: 'analytics_retention',
        targetLabel: 'analytics_retention',
        detail: {
          ok: true,
          days: input.days,
          apagarEventosBrutos: input.apagarEventosBrutos
        }
      })
      return result
    })
})
