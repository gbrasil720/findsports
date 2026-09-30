import { useQuery } from '@tanstack/react-query'
import { isRetryableError } from '@/lib/user-facing-error'
import { useTRPC } from '@/utils/trpc'
import type { EventsState } from './admin-model'

/*
 * Queries lidas por mais de uma aba do painel (WEB-138). Cada aba chama o
 * hook que precisa: o React Query deduplica pela chave, então não há
 * requisição extra, e ter as opções num lugar só mantém o `meta` igual em
 * todas as leituras. As abas mostram o próprio erro, sem toast global.
 */

export function useMyBar() {
  const trpc = useTRPC()
  return useQuery({
    ...trpc.pub.getMe.queryOptions(),
    meta: { errorToast: false }
  })
}

export function useMyEvents() {
  const trpc = useTRPC()
  return useQuery({
    ...trpc.pub.getMyEvents.queryOptions(),
    meta: { errorToast: false }
  })
}

export function useMySubscription() {
  const trpc = useTRPC()
  return useQuery({
    ...trpc.pub.getMySubscription.queryOptions(),
    meta: { errorToast: false }
  })
}

export function useMyEventCreationPolicy() {
  const trpc = useTRPC()
  return useQuery({
    ...trpc.pub.getMyEventCreationPolicy.queryOptions(),
    meta: { errorToast: false }
  })
}

export function useMyAnalyticsEntitlements() {
  const trpc = useTRPC()
  return useQuery({
    ...trpc.commercialAnalytics.getMyEntitlements.queryOptions(),
    meta: { errorToast: false }
  })
}

export function useEventsState(): EventsState {
  const { data, isLoading, isError, error, refetch } = useMyEvents()
  return isLoading
    ? { status: 'loading' }
    : isError || !data
      ? {
          status: 'error',
          retryable: isRetryableError(error),
          retry: () => {
            void refetch()
          }
        }
      : { status: 'ready', events: data }
}
