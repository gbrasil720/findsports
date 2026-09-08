/**
 * Commercial analytics domain types.
 *
 * Canonical event types per spec:
 *   profile_view, directions_opened, phone_clicked, whatsapp_opened
 */

// ---------------------------------------------------------------------------
// Event types (bar_commercial_event.type)
// ---------------------------------------------------------------------------

export const COMMERCIAL_EVENT_TYPES = [
  'profile_view',
  'directions_opened',
  'phone_clicked',
  'whatsapp_opened'
] as const
export type CommercialEventType = (typeof COMMERCIAL_EVENT_TYPES)[number]

// ---------------------------------------------------------------------------
// Subscription plans (subscription.plan)
// ---------------------------------------------------------------------------

import type { SubscriptionPlan as DbSubscriptionPlan } from '@findsports_oficial/db'

export type { SubscriptionPlan } from '@findsports_oficial/db'

// ---------------------------------------------------------------------------
// Percentage change helper
// ---------------------------------------------------------------------------

export function pctChange(current: number, previous: number): number | null {
  if (previous === 0 && current === 0) return 0
  if (previous === 0) return null
  return Math.round(((current - previous) / previous) * 100)
}

// ---------------------------------------------------------------------------
// Daily data point (for charts)
// ---------------------------------------------------------------------------

export interface DailyDataPoint {
  date: string // ISO date YYYY-MM-DD
  value: number
}

// ---------------------------------------------------------------------------
// Overview response — aligned with spec section 9.4 rollup shape
// ---------------------------------------------------------------------------

export interface AnalyticsOverview {
  // Current period — from bar_commercial_daily_rollup
  uniqueVisitors: number
  interestedPeople: number
  highIntentActions: number
  profileViews: number
  directionsOpened: number
  phoneClicked: number
  whatsappOpened: number

  // Comparison (previous period)
  uniqueVisitorsPrev: number
  interestedPeoplePrev: number
  highIntentActionsPrev: number
  profileViewsPrev: number
  directionsOpenedPrev: number
  phoneClickedPrev: number
  whatsappOpenedPrev: number

  // Percentage changes
  uniqueVisitorsChange: number | null
  interestedPeopleChange: number | null
  highIntentActionsChange: number | null
  profileViewsChange: number | null
  directionsOpenedChange: number | null
  phoneClickedChange: number | null
  whatsappOpenedChange: number | null

  // Daily time-series (current period)
  dailyProfileViews: DailyDataPoint[]
  dailyDirectionsOpened: DailyDataPoint[]
  dailyPhoneClicked: DailyDataPoint[]
  dailyWhatsappOpened: DailyDataPoint[]

  // Date range used
  from: string
  to: string
}

/**
 * Overview response after applying plan entitlements — what the API actually
 * returns to a pub. Every field the plan cannot view (metric or comparison)
 * is null, so the client never sees a partially masked comparison.
 */
export interface AnalyticsOverviewResponse {
  // Current period — always viewable: `canViewAnalytics`
  uniqueVisitors: number
  interestedPeople: number
  highIntentActions: number
  profileViews: number

  // Current period — per-metric entitlement
  directionsOpened: number | null
  phoneClicked: number | null
  whatsappOpened: number | null

  // Comparison (previous period) — `canViewComparison`, plus the metric
  // entitlement for channel-specific comparisons
  uniqueVisitorsPrev: number | null
  interestedPeoplePrev: number | null
  highIntentActionsPrev: number | null
  profileViewsPrev: number | null
  directionsOpenedPrev: number | null
  phoneClickedPrev: number | null
  whatsappOpenedPrev: number | null

  // Percentage changes
  uniqueVisitorsChange: number | null
  interestedPeopleChange: number | null
  highIntentActionsChange: number | null
  profileViewsChange: number | null
  directionsOpenedChange: number | null
  phoneClickedChange: number | null
  whatsappOpenedChange: number | null

  // Daily time-series (current period) — `canViewDailyBreakdown`, plus the
  // metric entitlement for channel-specific series
  dailyProfileViews: DailyDataPoint[] | null
  dailyDirectionsOpened: DailyDataPoint[] | null
  dailyPhoneClicked: DailyDataPoint[] | null
  dailyWhatsappOpened: DailyDataPoint[] | null

  // Date range used
  from: string
  to: string
}

// ---------------------------------------------------------------------------
// Event analytics response (per-event breakdown)
// ---------------------------------------------------------------------------

export interface EventAnalyticsRow {
  eventId: string
  eventName: string
  startsAt: string
  profileViews: number
  directionsOpened: number
  phoneClicked: number
  whatsappOpened: number
}

export interface EventAnalyticsResponse {
  events: EventAnalyticsRow[]
  from: string
  to: string
}

// ---------------------------------------------------------------------------
// Entitlements
// ---------------------------------------------------------------------------

export interface AnalyticsEntitlements {
  canViewAnalytics: boolean
  canViewPhoneClicked: boolean
  canViewWhatsappOpened: boolean
  canViewDirectionsOpened: boolean
  canViewComparison: boolean
  canViewDailyBreakdown: boolean
  canViewEventBreakdown: boolean
  maxDaysRetention: number | null
  plan: DbSubscriptionPlan
}
