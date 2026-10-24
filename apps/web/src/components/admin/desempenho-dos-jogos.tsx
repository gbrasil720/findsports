import type { EventComparisonTarget } from '@findsports_oficial/api/lib/commercial-analytics/types'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { getUserFacingMessage, isRetryableError } from '@/lib/user-facing-error'
import { useTRPC } from '@/utils/trpc'
import type { EventAnalyticsState, PolicyState } from './admin-model'
import {
  useEventsState,
  useMyAnalyticsEntitlements,
  useMyEventCreationPolicy,
  useMyEvents
} from './admin-queries'
import { AdminTabPanel } from './admin-tabs'
import type { AnalyticsDateRange } from './analytics-period'
import { EventPerformance } from './event-performance'
import { EventsManager } from './events-manager'

export function ScheduleTab({
  active,
  analyticsRange
}: {
  active: boolean
  analyticsRange: AnalyticsDateRange
}) {
  const trpc = useTRPC()
  const [eventComparisonTarget, setEventComparisonTarget] = useState<
    EventComparisonTarget | undefined
  >()

  const eventsState = useEventsState()
  const { data: events } = useMyEvents()

  const {
    data: creationPolicy,
    isLoading: loadingPolicy,
    isError: policyError,
    error: policyQueryError,
    refetch: refetchPolicy
  } = useMyEventCreationPolicy()

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

  const policyState: PolicyState = loadingPolicy
    ? { status: 'loading' }
    : policyError || !creationPolicy
      ? {
          status: 'error',
          retryable: isRetryableError(policyQueryError),
          retry: () => {
            void refetchPolicy()
          }
        }
      : { status: 'ready', policy: creationPolicy }

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
    <AdminTabPanel id="admin-grade" active={active} className="space-y-6">
      <EventsManager eventsState={eventsState} policyState={policyState} />
      <EventPerformance eventAnalyticsState={eventAnalyticsState} />
    </AdminTabPanel>
  )
}
