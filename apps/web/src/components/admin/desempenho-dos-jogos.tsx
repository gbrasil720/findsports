import type { EventComparisonTarget } from '@findsports_oficial/api/lib/commercial-analytics/types'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { getUserFacingMessage, isRetryableError } from '@/lib/user-facing-error'
import { useTRPC } from '@/utils/trpc'
import type { EventAnalyticsState } from './admin-model'
import { useMyAnalyticsEntitlements, useMyEvents } from './admin-queries'
import { getAnalyticsRange } from './analytics-period'
import { EventPerformance } from './event-performance'

/**
 * "Desempenho por jogo" (analytics por jogo, com comparação no plano que
 * tem), no pé da tela Jogos. O design novo não desenha esta seção: ela segue
 * com a cara de antes até ganhar a sua.
 */
export function DesempenhoDosJogos() {
  const [analyticsRange] = useState(() => getAnalyticsRange('30d'))
  const trpc = useTRPC()
  const [eventComparisonTarget, setEventComparisonTarget] = useState<
    EventComparisonTarget | undefined
  >()

  const { data: events } = useMyEvents()

  const {
    data: analyticsEntitlements,
    isLoading: loadingEntitlements,
    isError: entitlementsError,
    error: entitlementsQueryError,
    refetch: refetchEntitlements
  } = useMyAnalyticsEntitlements()

  const periodStart = Date.parse(analyticsRange.from)
  const periodEnd = Date.parse(analyticsRange.to)
  const comparisonEventIds = (events ?? [])
    .filter((event) => {
      const startsAt = new Date(event.startsAt).getTime()
      return startsAt >= periodStart && startsAt <= periodEnd
    })
    .map((event) => event.id)
    .slice(0, 3)
  const defaultComparisonTarget =
    analyticsEntitlements?.comparison !== 'previous_period' &&
    comparisonEventIds.length > 0
      ? { type: 'events' as const, eventIds: comparisonEventIds }
      : undefined
  const requestedComparisonTarget =
    eventComparisonTarget ?? defaultComparisonTarget

  const {
    data: eventAnalytics,
    isLoading: loadingEventAnalytics,
    isFetching: fetchingEventAnalytics,
    isError: eventAnalyticsError,
    error: eventAnalyticsQueryError,
    refetch: refetchEventAnalytics
  } = useQuery({
    ...trpc.commercialAnalytics.getMyEventAnalytics.queryOptions({
      from: analyticsRange.from,
      to: analyticsRange.to,
      ...(requestedComparisonTarget
        ? { comparisonTarget: requestedComparisonTarget }
        : {})
    }),
    meta: { errorToast: false }
  })

  // O entitlement (não o plano) é autoritativo.
  const eventAnalyticsState: EventAnalyticsState = loadingEntitlements
    ? { status: 'loading' }
    : entitlementsError || !analyticsEntitlements
      ? {
          status: 'error',
          retryable: isRetryableError(entitlementsQueryError),
          retry: () => {
            void refetchEntitlements()
          }
        }
      : analyticsEntitlements.eventBreakdown === 'none'
        ? { status: 'blocked' }
        : loadingEventAnalytics
          ? { status: 'loading' }
          : eventAnalyticsError
            ? {
                status: 'error',
                message: getUserFacingMessage(
                  eventAnalyticsQueryError,
                  'Não foi possível carregar o desempenho dos jogos. Tente novamente.'
                ),
                retryable: isRetryableError(eventAnalyticsQueryError),
                retry: () => {
                  void refetchEventAnalytics()
                }
              }
            : eventAnalytics?.events && eventAnalytics.events.length > 0
              ? {
                  status: 'ready',
                  items: eventAnalytics.events,
                  comparisonMode: analyticsEntitlements.comparison,
                  comparisonTarget: requestedComparisonTarget,
                  comparison: eventAnalytics.comparison,
                  comparisonLoading:
                    fetchingEventAnalytics && !!requestedComparisonTarget,
                  onComparisonTargetChange: (target) => {
                    setEventComparisonTarget(target)
                  },
                  from: eventAnalytics.from,
                  to: eventAnalytics.to
                }
              : { status: 'empty' }

  return (
    <div className="painel-legado">
      <EventPerformance eventAnalyticsState={eventAnalyticsState} />
    </div>
  )
}
