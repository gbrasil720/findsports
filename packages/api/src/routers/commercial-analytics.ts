import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import { adminProcedure, protectedProcedure, router } from '../index'
import {
  applyOverviewEntitlements,
  COMMERCIAL_EVENT_TYPES,
  COMMERCIAL_TIME_ZONE,
  canViewEventType,
  getAnalyticsEntitlements,
  getMyAnalyticsOverview,
  getMyEventAnalytics,
  recordCommercialEvent,
  resolveBarAndPlan,
  runAnalyticsRetention
} from '../lib/commercial-analytics'

const DAY_MS = 24 * 60 * 60 * 1000
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const dateTimeParts = new Intl.DateTimeFormat('en-CA', {
  timeZone: COMMERCIAL_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23'
})

export const analyticsDateSchema = z
  .string()
  .datetime({ offset: true })
  .or(z.string().date())

function startOfCommercialDay(date: string): Date {
  const [year, month, day] = date.split('-').map(Number) as [
    number,
    number,
    number
  ]
  const target = Date.UTC(year, month - 1, day)
  let instant = target

  // Duas passagens resolvem o deslocamento IANA sem fixar UTC-3 e continuam
  // corretas se a regra de horário de verão de São Paulo mudar no futuro.
  for (let pass = 0; pass < 2; pass += 1) {
    const parts = Object.fromEntries(
      dateTimeParts
        .formatToParts(new Date(instant))
        .filter((part) => part.type !== 'literal')
        .map((part) => [part.type, Number(part.value)])
    )
    if (
      parts.year === undefined ||
      parts.month === undefined ||
      parts.day === undefined ||
      parts.hour === undefined ||
      parts.minute === undefined ||
      parts.second === undefined
    ) {
      throw new Error('Intl não retornou uma data comercial completa')
    }
    const observed = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second
    )
    instant += target - observed
  }

  return new Date(instant)
}

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
    ? startOfCommercialDay(input.from)
    : new Date(input.from)
  const to = DATE_ONLY_PATTERN.test(input.to)
    ? new Date(startOfCommercialDay(nextDate(input.to)).getTime() - 1)
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
   * Record a commercial event (fan action on a bar profile).
   * Authenticated fan only. No impersonation.
   */
  recordCommercialEvent: protectedProcedure
    .input(
      z.object({
        pubId: z.string().uuid(),
        type: z.enum(COMMERCIAL_EVENT_TYPES),
        sourceEventId: z.string().uuid().optional(),
        recommendationRunId: z.string().uuid().optional()
      })
    )
    .mutation(async ({ ctx, input }) => {
      return recordCommercialEvent(ctx, input)
    }),

  /**
   * Get analytics overview for the authenticated pub's bar.
   * Tenant-safe: bar derived from session.
   */
  getMyAnalyticsOverview: protectedProcedure
    .input(
      z.object({
        from: analyticsDateSchema,
        to: analyticsDateSchema
      })
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id

      if (ctx.session.user.role !== 'pub') {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Apenas contas de bar podem acessar analytics'
        })
      }

      const { barId, plan } = await resolveBarAndPlan(userId)
      const entitlements = getAnalyticsEntitlements(plan)

      if (!entitlements.canViewAnalytics) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Plano não permite analytics'
        })
      }

      const { from, to, periodDays } = parseAnalyticsRange(input)

      if (
        entitlements.maxDaysRetention !== null &&
        periodDays > entitlements.maxDaysRetention
      ) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: `Plano ${plan} suporta até ${entitlements.maxDaysRetention} dias`
        })
      }

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
  getMyEventAnalytics: protectedProcedure
    .input(
      z.object({
        from: analyticsDateSchema,
        to: analyticsDateSchema
      })
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id

      if (ctx.session.user.role !== 'pub') {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Apenas contas de bar podem acessar analytics'
        })
      }

      const { barId, plan } = await resolveBarAndPlan(userId)
      const entitlements = getAnalyticsEntitlements(plan)

      if (!entitlements.canViewEventBreakdown) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Plano não permite breakdown por evento'
        })
      }

      const { from, to, periodDays } = parseAnalyticsRange(input)

      if (
        entitlements.maxDaysRetention !== null &&
        periodDays > entitlements.maxDaysRetention
      ) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: `Plano ${plan} suporta até ${entitlements.maxDaysRetention} dias`
        })
      }

      return getMyEventAnalytics(barId, from, to)
    }),

  /**
   * Get entitlements for the authenticated pub's plan.
   */
  getMyEntitlements: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id

    if (ctx.session.user.role !== 'pub') {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Apenas contas de bar podem acessar analytics'
      })
    }

    const { plan } = await resolveBarAndPlan(userId)
    return getAnalyticsEntitlements(plan)
  }),

  /**
   * Check if a specific event type is accessible for the pub's plan.
   */
  canViewEventType: protectedProcedure
    .input(z.object({ eventType: z.string() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id

      if (ctx.session.user.role !== 'pub') {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Apenas contas de bar podem acessar analytics'
        })
      }

      const { plan } = await resolveBarAndPlan(userId)
      return canViewEventType(plan, input.eventType)
    }),

  /**
   * Admin: retenção de analytics (ESC-10).
   *
   * Consolida os rollups de dias fechados e, opcionalmente, poda os eventos
   * brutos já consolidados. A consolidação sempre roda; a poda exige
   * `apagarEventosBrutos: true` explícito. Rollups nunca são apagados — são o
   * registro de longo prazo, e a versão anterior desta rotina apagava
   * justamente eles.
   */
  cleanupRetention: adminProcedure
    .input(
      z.object({
        days: z.number().int().min(1).max(365).default(90),
        // ESC-10: consolidar sempre; apagar só se pedido explicitamente.
        apagarEventosBrutos: z.boolean().default(false)
      })
    )
    .mutation(async ({ input }) => {
      return runAnalyticsRetention({
        retentionDays: input.days,
        apagarEventosBrutos: input.apagarEventosBrutos
      })
    })
})
