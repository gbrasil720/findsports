import type { AppRouter } from '@findsports_oficial/api/routers/index'
import type { SubscriptionPlan as DbSubscriptionPlan } from '@findsports_oficial/db'
import type { inferRouterOutputs } from '@trpc/server'

type RouterOutputs = inferRouterOutputs<AppRouter>

export type AdminBar = RouterOutputs['pub']['getMe']
export type AdminEvent = RouterOutputs['pub']['getMyEvents'][number]
export type EventCreationPolicy =
  RouterOutputs['pub']['getMyEventCreationPolicy']
export type Subscription = RouterOutputs['pub']['getMySubscription']
export type SubscriptionPlan = DbSubscriptionPlan

/* ------------------------------------------------------------------ */
/* Analytics — inferred from API router                                */
/* ------------------------------------------------------------------ */

export type AnalyticsOverviewData =
  RouterOutputs['commercialAnalytics']['getMyAnalyticsOverview']
export type EventAnalyticsData =
  RouterOutputs['commercialAnalytics']['getMyEventAnalytics']
export type EventAnalyticsRow = EventAnalyticsData['events'][number]

export type EventsState =
  | { status: 'loading' }
  | { status: 'error'; retry: () => void }
  | { status: 'ready'; events: AdminEvent[] }

export type PolicyState =
  | { status: 'loading' }
  | { status: 'error'; retry: () => void }
  | { status: 'ready'; policy: EventCreationPolicy }

export type PlanState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; plan: SubscriptionPlan }

/* ------------------------------------------------------------------ */
/* Analytics state machines                                            */
/* ------------------------------------------------------------------ */

export type AnalyticsOverviewState =
  | { status: 'loading' }
  | { status: 'error'; retry: () => void }
  | { status: 'empty' }
  | { status: 'partial'; data: AnalyticsOverviewData }
  | { status: 'ready'; data: AnalyticsOverviewData }

export type EventAnalyticsState =
  | { status: 'loading' }
  | { status: 'error'; retry: () => void }
  | { status: 'blocked' }
  | { status: 'empty' }
  | { status: 'ready'; items: EventAnalyticsRow[] }

/* ------------------------------------------------------------------ */
/* Readiness diagnostics                                               */
/* ------------------------------------------------------------------ */

export type ReadinessCheck = {
  key: string
  label: string
  done: boolean
}

export type ProfileReadiness = {
  checks: ReadinessCheck[]
  score: number
  total: number
}

/* ------------------------------------------------------------------ */
/* Formatting helpers                                                  */
/* ------------------------------------------------------------------ */

/**
 * Format a rate as a percentage string.
 * Returns "—" when denominator is zero.
 */
export function formatRate(num: number, den: number): string {
  if (den === 0) return '—'
  return `${((num / den) * 100).toFixed(1)}%`
}

export const LOCKED_ANALYTICS_VALUE = 'Exclusivo do plano superior'

export function formatAnalyticsValue(value: number | null): string {
  return value === null ? LOCKED_ANALYTICS_VALUE : value.toLocaleString('pt-BR')
}

export function sumAnalyticsActions(data: {
  directionsOpened: number | null
  phoneClicked: number | null
  whatsappOpened: number | null
}): number | null {
  return [data.directionsOpened, data.whatsappOpened, data.phoneClicked].reduce<
    number | null
  >(
    (total, value) => (total === null || value === null ? null : total + value),
    0
  )
}

/**
 * Determine the main action label from analytics data.
 * Tie-breaking order (spec §4.6): directions > whatsapp > phone.
 */
export function getMainAction(data: {
  directionsOpened: number | null
  phoneClicked: number | null
  whatsappOpened: number | null
}): string {
  const actions = [
    { label: 'Rota', count: data.directionsOpened ?? 0 },
    { label: 'WhatsApp', count: data.whatsappOpened ?? 0 },
    { label: 'Telefone', count: data.phoneClicked ?? 0 }
  ]

  const max = Math.max(...actions.map((a) => a.count))
  // Sem nenhuma ação contabilizada (ou sem métricas visíveis no plano) não
  // existe "ação mais usada" — evita cair no tie-break e mostrar "Rota".
  if (max === 0) return '—'
  return actions.find((a) => a.count === max)?.label ?? '—'
}
