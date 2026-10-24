import type { SubscriptionStanding } from '@findsports_oficial/api/lib/current-plan'
import type { AppRouter } from '@findsports_oficial/api/routers/index'
import type { SubscriptionPlan as DbSubscriptionPlan } from '@findsports_oficial/db'
import type { inferRouterOutputs } from '@trpc/server'

type RouterOutputs = inferRouterOutputs<AppRouter>

export type AdminBar = RouterOutputs['pub']['getMe']
export type AdminEvent = RouterOutputs['pub']['getMyEvents'][number]
export type EventCreationPolicy =
  RouterOutputs['pub']['getMyEventCreationPolicy']
export type SubscriptionPlan = DbSubscriptionPlan

/* ------------------------------------------------------------------ */
/* Analytics — inferred from API router                                */
/* ------------------------------------------------------------------ */

export type AnalyticsOverviewData =
  RouterOutputs['commercialAnalytics']['getMyAnalyticsOverview']
export type AnalyticsEntitlementsData =
  RouterOutputs['commercialAnalytics']['getMyEntitlements']
export type EventAnalyticsData =
  RouterOutputs['commercialAnalytics']['getMyEventAnalytics']
export type EventAnalyticsRow = EventAnalyticsData['events'][number]
export type EventComparisonData = NonNullable<EventAnalyticsData['comparison']>

export type EventsState =
  | { status: 'loading' }
  | { status: 'error'; retry: () => void; retryable: boolean }
  | { status: 'ready'; events: AdminEvent[] }

export type PolicyState =
  | { status: 'loading' }
  | { status: 'error'; retry: () => void; retryable: boolean }
  | { status: 'ready'; policy: EventCreationPolicy }

/**
 * Assinatura lida por `getMySubscription`. `plan` é o contratado, que o preview
 * usa para o selo; `standing` diz se ele vale agora, e é o que libera os
 * recursos pagos — nunca `bar.plan`. Plano parado manda regularizar em vez de
 * contratar (WEB-141). A falha não traz `retry`: a aba mostra esse erro uma
 * vez só (WEB-142).
 */
export type PlanState =
  | { status: 'loading' }
  | { status: 'error' }
  | {
      status: 'ready'
      plan: SubscriptionPlan
      standing: SubscriptionStanding | null
    }

/* ------------------------------------------------------------------ */
/* Formatting helpers                                                  */
/* ------------------------------------------------------------------ */

/**
 * Taxa de interesse: de quem viu o bar, que fração se interessou. São pessoas
 * dos dois lados — com ações no numerador, um visitante que abre WhatsApp e
 * rota virava "200%" (WEB-251). O teto é 1: quem agiu sem abertura contada na
 * janela não é "alguém que viu". `null` sem visitantes.
 */
export function getInterestRate(
  interestedPeople: number,
  uniqueVisitors: number
): number | null {
  if (uniqueVisitors <= 0) return null
  return Math.min(interestedPeople, uniqueVisitors) / uniqueVisitors
}

export function formatInterestRate(
  interestedPeople: number,
  uniqueVisitors: number
): string {
  const rate = getInterestRate(interestedPeople, uniqueVisitors)
  return rate === null ? '—' : `${(rate * 100).toFixed(1)}%`
}

export const LOCKED_ANALYTICS_VALUE = 'Exclusivo do plano superior'

export function formatAnalyticsValue(value: number | null): string {
  return value === null ? LOCKED_ANALYTICS_VALUE : value.toLocaleString('pt-BR')
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
