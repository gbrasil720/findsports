import type { SubscriptionPlan } from '@findsports_oficial/db'
import type { AnalyticsEntitlements } from './types'

/**
 * Plan-based entitlements for commercial analytics.
 *
 * Each plan gets a unique set of capabilities. No two plans share the same
 * entitlement shape — this makes it easy to justify upgrades.
 *
 * - Starter:  profile views only, 30d retention, no comparison
 * - Pro:      + phone clicked, whatsapp opened, 365d retention, comparison
 * - Elite:    + directions opened, daily breakdown, event breakdown, unlimited
 */

const ENTITLEMENTS: Record<SubscriptionPlan, AnalyticsEntitlements> = {
  starter: {
    canViewAnalytics: true,
    canViewPhoneClicked: false,
    canViewWhatsappOpened: false,
    canViewDirectionsOpened: false,
    canViewComparison: false,
    canViewDailyBreakdown: false,
    canViewEventBreakdown: false,
    maxDaysRetention: 30,
    plan: 'starter'
  },
  pro: {
    canViewAnalytics: true,
    canViewPhoneClicked: true,
    canViewWhatsappOpened: true,
    canViewDirectionsOpened: false,
    canViewComparison: true,
    canViewDailyBreakdown: false,
    canViewEventBreakdown: false,
    maxDaysRetention: 365,
    plan: 'pro'
  },
  elite: {
    canViewAnalytics: true,
    canViewPhoneClicked: true,
    canViewWhatsappOpened: true,
    canViewDirectionsOpened: true,
    canViewComparison: true,
    canViewDailyBreakdown: true,
    canViewEventBreakdown: true,
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
