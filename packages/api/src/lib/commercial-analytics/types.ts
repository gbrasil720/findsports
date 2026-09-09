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

export type AnalyticsComparisonMode =
  | 'previous_period'
  | 'cross_game'
  | 'advanced'

export type EventComparisonTarget =
  | { type: 'events'; eventIds: string[] }
  | { type: 'event_to_bar'; eventId: string }

export const COMPARISON_METRICS = [
  'uniqueVisitors',
  'profileViews',
  'directionsOpened',
  'phoneClicked',
  'whatsappOpened'
] as const
export type ComparisonMetric = (typeof COMPARISON_METRICS)[number]

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

/** Limitações explícitas dos dados reconstruídos depois da retenção. */
export type AnalyticsLimitation =
  'distinct_counts_are_daily_sums_after_retention'

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

  // Explicit data-quality caveats for pruned periods.
  limitations: AnalyticsLimitation[]
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

  // Explicit data-quality caveats for pruned periods.
  limitations: AnalyticsLimitation[]
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

/** Raw per-game snapshot used to calculate comparison and advanced insights. */
export interface EventAnalyticsSnapshot {
  eventId: string
  eventName: string
  startsAt: string
  weekday: number
  windowHours: number
  uniqueVisitors: number
  profileViews: number
  directionsOpened: number
  phoneClicked: number
  whatsappOpened: number
}

export interface ComparisonMetricValues {
  uniqueVisitors: number | null
  profileViews: number | null
  directionsOpened: number | null
  phoneClicked: number | null
  whatsappOpened: number | null
}

/** Per-game comparison values. Rates are percentages, not fractions. */
export interface EventComparisonRow extends ComparisonMetricValues {
  eventId: string
  eventName: string
  startsAt: string
  windowHours: number
  normalized: ComparisonMetricValues
  conversionRate: number | null
}

export interface EventComparisonRank {
  eventId: string
  eventName: string
  conversionRate: number | null
  rank: number
}

export interface AnalyticsBenchmark {
  scope: 'history' | 'weekday'
  metric: ComparisonMetric
  current: number
  baseline: number
  changePercent: number | null
  eventId?: string
  weekday?: number
}

export interface AnalyticsInsight {
  kind: 'anomaly'
  scope: 'weekday'
  metric: ComparisonMetric
  eventId: string
  eventName: string
  weekday: number
  value: number
  baseline: number
  changePercent: number
}

export interface EventComparisonResult {
  mode: 'cross_game' | 'advanced'
  target: EventComparisonTarget
  status: 'ready' | 'empty'
  emptyReason?: 'no_data' | 'not_enough_games' | 'no_baseline'
  events: EventComparisonRow[]
  benchmark: EventComparisonRow | null
  ranking: EventComparisonRank[]
  benchmarks: AnalyticsBenchmark[]
  insights: AnalyticsInsight[]
}

export interface EventAnalyticsResponse {
  events: EventAnalyticsRow[]
  from: string
  to: string
  comparison?: EventComparisonResult
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
  /** Comparison capability sold by the plan; the server is authoritative. */
  comparison: AnalyticsComparisonMode
  canViewDailyBreakdown: boolean
  /**
   * Per-event (por jogo) analytics level:
   * - `basic` — per-game breakdown with the plan's base metrics (profile views)
   * - `complete` — per-game breakdown with the plan's full metric set
   * - `none` — no per-game breakdown
   */
  eventBreakdown: 'none' | 'basic' | 'complete'
  maxDaysRetention: number | null
  plan: DbSubscriptionPlan
}
