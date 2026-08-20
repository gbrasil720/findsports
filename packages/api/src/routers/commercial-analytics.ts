import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import { adminProcedure, protectedProcedure, router } from '../index'
import {
  COMMERCIAL_EVENT_TYPES,
  canViewEventType,
  getAnalyticsEntitlements,
  getMyAnalyticsOverview,
  getMyEventAnalytics,
  recordCommercialEvent,
  resolveBarAndPlan,
  runAnalyticsRetention
} from '../lib/commercial-analytics'

const dateSchema = z
  .string()
  .datetime()
  .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))

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
        from: dateSchema,
        to: dateSchema
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

      const from = new Date(input.from)
      const to = new Date(input.to)
      const periodDays = Math.ceil(
        (to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)
      )

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

      // Server-side entitlement filtering
      return {
        ...overview,
        phoneClicked: entitlements.canViewPhoneClicked
          ? overview.phoneClicked
          : null,
        whatsappOpened: entitlements.canViewWhatsappOpened
          ? overview.whatsappOpened
          : null,
        directionsOpened: entitlements.canViewDirectionsOpened
          ? overview.directionsOpened
          : null,
        phoneClickedPrev:
          entitlements.canViewComparison && entitlements.canViewPhoneClicked
            ? overview.phoneClickedPrev
            : null,
        whatsappOpenedPrev:
          entitlements.canViewComparison && entitlements.canViewWhatsappOpened
            ? overview.whatsappOpenedPrev
            : null,
        directionsOpenedPrev:
          entitlements.canViewComparison && entitlements.canViewDirectionsOpened
            ? overview.directionsOpenedPrev
            : null,
        phoneClickedChange:
          entitlements.canViewComparison && entitlements.canViewPhoneClicked
            ? overview.phoneClickedChange
            : null,
        whatsappOpenedChange:
          entitlements.canViewComparison && entitlements.canViewWhatsappOpened
            ? overview.whatsappOpenedChange
            : null,
        directionsOpenedChange:
          entitlements.canViewComparison && entitlements.canViewDirectionsOpened
            ? overview.directionsOpenedChange
            : null,
        dailyProfileViews: entitlements.canViewDailyBreakdown
          ? overview.dailyProfileViews
          : null,
        dailyPhoneClicked:
          entitlements.canViewDailyBreakdown && entitlements.canViewPhoneClicked
            ? overview.dailyPhoneClicked
            : null,
        dailyWhatsappOpened:
          entitlements.canViewDailyBreakdown &&
          entitlements.canViewWhatsappOpened
            ? overview.dailyWhatsappOpened
            : null,
        dailyDirectionsOpened:
          entitlements.canViewDailyBreakdown &&
          entitlements.canViewDirectionsOpened
            ? overview.dailyDirectionsOpened
            : null,
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
        from: dateSchema,
        to: dateSchema
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

      const from = new Date(input.from)
      const to = new Date(input.to)
      const periodDays = Math.ceil(
        (to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)
      )

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
