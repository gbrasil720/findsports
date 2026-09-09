import type { SubscriptionPlan } from '@findsports_oficial/db'
import { maskEventComparisonRow, rankEventComparison } from './comparison'
import type {
  AnalyticsEntitlements,
  ComparisonMetric,
  EventAnalyticsResponse,
  EventComparisonResult
} from './types'

/**
 * Plan-based entitlements for commercial analytics.
 *
 * Each plan gets a unique set of capabilities. No two plans share the same
 * entitlement shape — this makes it easy to justify upgrades.
 *
 * - Starter:  profile views only, 30d retention, previous-period comparison,
 *              basic per-game
 * - Pro:      + directions opened, phone clicked, whatsapp opened, 365d
 *              retention, cross-game comparison
 * - Elite:    + daily breakdown, complete per-game, unlimited retention,
 *              advanced comparison and insights
 */

const ENTITLEMENTS: Record<SubscriptionPlan, AnalyticsEntitlements> = {
  starter: {
    canViewAnalytics: true,
    canViewPhoneClicked: false,
    canViewWhatsappOpened: false,
    canViewDirectionsOpened: false,
    canViewComparison: true,
    comparison: 'previous_period',
    canViewDailyBreakdown: false,
    eventBreakdown: 'basic',
    maxDaysRetention: 30,
    plan: 'starter'
  },
  pro: {
    canViewAnalytics: true,
    canViewPhoneClicked: true,
    canViewWhatsappOpened: true,
    canViewDirectionsOpened: true,
    canViewComparison: true,
    comparison: 'cross_game',
    canViewDailyBreakdown: false,
    eventBreakdown: 'complete',
    maxDaysRetention: 365,
    plan: 'pro'
  },
  elite: {
    canViewAnalytics: true,
    canViewPhoneClicked: true,
    canViewWhatsappOpened: true,
    canViewDirectionsOpened: true,
    canViewComparison: true,
    comparison: 'advanced',
    canViewDailyBreakdown: true,
    eventBreakdown: 'complete',
    maxDaysRetention: null,
    plan: 'elite'
  }
}

export function getAnalyticsEntitlements(
  plan: SubscriptionPlan
): AnalyticsEntitlements {
  return ENTITLEMENTS[plan]
}

/**
 * Returns true if the plan has access to the given event type analytics.
 */
export function canViewEventType(
  plan: SubscriptionPlan,
  eventType: string
): boolean {
  const e = ENTITLEMENTS[plan]
  switch (eventType) {
    case 'profile_view':
      return e.canViewAnalytics
    case 'phone_clicked':
      return e.canViewPhoneClicked
    case 'whatsapp_opened':
      return e.canViewWhatsappOpened
    case 'directions_opened':
      return e.canViewDirectionsOpened
    default:
      return false
  }
}

/** Metrics a comparison may expose for the plan. */
export function getComparisonMetrics(
  entitlements: AnalyticsEntitlements
): ComparisonMetric[] {
  return [
    'uniqueVisitors',
    'profileViews',
    ...(entitlements.canViewDirectionsOpened
      ? ['directionsOpened' as const]
      : []),
    ...(entitlements.canViewPhoneClicked ? ['phoneClicked' as const] : []),
    ...(entitlements.canViewWhatsappOpened ? ['whatsappOpened' as const] : [])
  ]
}

/** Remove every comparison value that the plan is not entitled to see. */
export function applyEventComparisonEntitlements(
  comparison: EventComparisonResult,
  entitlements: AnalyticsEntitlements
): EventComparisonResult {
  const metrics = getComparisonMetrics(entitlements)
  const events = comparison.events.map((event) =>
    maskEventComparisonRow(event, metrics)
  )
  const benchmark = comparison.benchmark
    ? maskEventComparisonRow(comparison.benchmark, metrics)
    : null

  return {
    mode: comparison.mode,
    target: comparison.target,
    status: comparison.status,
    ...(comparison.emptyReason ? { emptyReason: comparison.emptyReason } : {}),
    events,
    benchmark,
    ranking: rankEventComparison(events),
    benchmarks: comparison.benchmarks.filter((item) =>
      metrics.includes(item.metric)
    ),
    insights: comparison.insights.filter((item) =>
      metrics.includes(item.metric)
    )
  }
}

/**
 * Aplica o entitlement de analytics por jogo na resposta: métricas que o
 * plano não enxerga vêm nulas (mesma regra do overview). O servidor é
 * autoritativo — o cliente nunca decide qual métrica ele pode ver.
 */
export function applyEventBreakdownEntitlements(
  response: EventAnalyticsResponse,
  entitlements: AnalyticsEntitlements
) {
  return {
    from: response.from,
    to: response.to,
    events: response.events.map((event) => ({
      ...event,
      directionsOpened: entitlements.canViewDirectionsOpened
        ? event.directionsOpened
        : null,
      phoneClicked: entitlements.canViewPhoneClicked
        ? event.phoneClicked
        : null,
      whatsappOpened: entitlements.canViewWhatsappOpened
        ? event.whatsappOpened
        : null
    })),
    ...(response.comparison
      ? {
          comparison: applyEventComparisonEntitlements(
            response.comparison,
            entitlements
          )
        }
      : {})
  }
}
