import type { EventComparisonTarget } from '@findsports_oficial/api/lib/commercial-analytics/types'
import {
  resolveEventScreen,
  SCREEN_AMENITY_ID,
  SOUND_AMENITY_ID
} from '@findsports_oficial/api/lib/event-screen'
import { effectiveHouseOffer } from '@findsports_oficial/api/lib/house-offer'
import { useQuery } from '@tanstack/react-query'
import { useRouterState } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import type {
  AdminEvent,
  EventAnalyticsState
} from '@/components/admin/admin-model'
import { useMyAnalyticsEntitlements } from '@/components/admin/admin-queries'
import type { AnalyticsDateRange } from '@/components/admin/analytics-period'
import { BAR_RESERVATIONS_QUERY } from '@/lib/query-cache'
import { getUserFacingMessage, isRetryableError } from '@/lib/user-facing-error'
import { useTRPC } from '@/utils/trpc'
import { usePainel } from './painel-shell'

/*
 * Leituras que Hoje e Jogos dividem (WEB-501, fase 2). A chave é a mesma da
 * casca, então não há ida extra ao servidor.
 */

/** Quem vai, por jogo com a validação aberta: Elite ou código em aberto. */
export function useGoing() {
  const trpc = useTRPC()
  const { showsGoing } = usePainel()
  return useQuery({
    ...trpc.barReservations.going.queryOptions(),
    ...BAR_RESERVATIONS_QUERY,
    enabled: showsGoing,
    meta: { errorToast: false }
  })
}

export type GoingGame = NonNullable<ReturnType<typeof useGoing>['data']>[number]

/** Quantos marcaram e quantos já validaram no balcão. */
export function goingCount(game: GoingGame | undefined) {
  const going = game?.people.length ?? 0
  const arrived = game?.people.filter((p) => p.validatedAt).length ?? 0
  return { going, arrived }
}

/** Interesse do jogo sobre a média do bar (WEB-127): nunca a contagem. */
export function useInterest() {
  const trpc = useTRPC()
  const { data } = useQuery({
    ...trpc.pub.getMyInterest.queryOptions(),
    meta: { errorToast: false }
  })
  return {
    gathering: data?.status === 'gathering',
    ratio: new Map(
      data?.status === 'ready'
        ? data.events.map((item) => [item.eventId, item.ratio])
        : []
    )
  }
}

export function interestLabel(ratio: number): string {
  return `Interesse: ${ratio.toLocaleString('pt-BR')}x a média deste bar`
}

/** Telas e som declarados no cadastro do bar (Meu espaço). */
export function barScreen(bar: {
  amenities: number[]
  screenCount: number | null
}) {
  return {
    tv: bar.amenities.includes(SCREEN_AMENITY_ID),
    screens: bar.screenCount,
    sound: bar.amenities.includes(SOUND_AMENITY_ID)
  }
}

/** Telão e som deste jogo (WEB-399): nulo herda das características do bar. */
export function gameScreen(
  event: { onBigScreen: boolean | null; withSound: boolean | null },
  bar: { amenities: number[] }
) {
  return resolveEventScreen(event, bar.amenities)
}

/**
 * A oferta que vale neste jogo (WEB-422): a dele, a padrão do bar ou nenhuma.
 * Só o Elite mostra oferta, como na página do bar.
 */
export function gameOffer(
  event: { houseOffer: string | null; noHouseOffer: boolean },
  bar: { houseOffer: string | null },
  elite: boolean
): string | null {
  return elite ? effectiveHouseOffer(bar.houseOffer, event) : null
}

/** Jogo em rascunho (WEB-436): só o painel vê. */
export const isDraft = (event: { publishedAt: string | Date | null }) =>
  event.publishedAt === null

/** O desempenho por jogo do período (o mesmo pedido da aba Grade antiga). */
export function useEventAnalytics(
  range: AnalyticsDateRange,
  events: AdminEvent[]
) {
  const trpc = useTRPC()
  const [target, setTarget] = useState<EventComparisonTarget | undefined>()
  const entitlements = useMyAnalyticsEntitlements()
  const from = Date.parse(range.from)
  const to = Date.parse(range.to)
  const defaultIds = events
    .filter((event) => {
      const startsAt = Date.parse(event.startsAt)
      return startsAt >= from && startsAt <= to
    })
    .map((event) => event.id)
    .slice(0, 3)
  const requested =
    target ??
    (entitlements.data?.comparison !== 'previous_period' && defaultIds.length
      ? { type: 'events' as const, eventIds: defaultIds }
      : undefined)
  const blocked = entitlements.data?.eventBreakdown === 'none'
  const q = useQuery({
    ...trpc.commercialAnalytics.getMyEventAnalytics.queryOptions({
      from: range.from,
      to: range.to,
      ...(requested ? { comparisonTarget: requested } : {})
    }),
    enabled: entitlements.isSuccess && !blocked,
    meta: { errorToast: false }
  })

  // O entitlement (não o plano) é autoritativo.
  const state: EventAnalyticsState = entitlements.isLoading
    ? { status: 'loading' }
    : entitlements.isError || !entitlements.data
      ? {
          status: 'error',
          retryable: isRetryableError(entitlements.error),
          retry: () => void entitlements.refetch()
        }
      : blocked
        ? { status: 'blocked' }
        : q.isLoading
          ? { status: 'loading' }
          : q.isError
            ? {
                status: 'error',
                message: getUserFacingMessage(
                  q.error,
                  'Não foi possível carregar o desempenho dos jogos. Tente novamente.'
                ),
                retryable: isRetryableError(q.error),
                retry: () => void q.refetch()
              }
            : q.data?.events.length
              ? {
                  status: 'ready',
                  items: q.data.events,
                  comparisonMode: entitlements.data.comparison,
                  comparisonTarget: requested,
                  comparison: q.data.comparison,
                  comparisonLoading: q.isFetching && !!requested,
                  onComparisonTargetChange: setTarget,
                  from: q.data.from,
                  to: q.data.to
                }
              : { status: 'empty' }

  return {
    state,
    byEvent: new Map((q.data?.events ?? []).map((row) => [row.eventId, row]))
  }
}

/**
 * Rola até o `#id` da URL quando a tela termina de carregar (`ready`): o
 * roteador só rola no clique, antes de o bloco existir.
 */
export function useHashScroll(ready: boolean) {
  const hash = useRouterState({
    select: (state) => state.location.hash.replace(/^#/, '')
  })
  const done = useRef('')
  useEffect(() => {
    if (!ready || !hash || done.current === hash) return
    const target = document.getElementById(hash)
    if (!target) return
    done.current = hash
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    target.scrollIntoView({
      block: 'start',
      behavior: reduce ? 'auto' : 'smooth'
    })
  }, [ready, hash])
}

/** Cor do avatar de quem ainda não validou (a primeira, acid, é de quem validou). */
export const AVATAR_COLORS = [
  '#c9f135',
  '#f6b8a6',
  '#b8d2f0',
  '#e7d3a8',
  '#cfe3b0',
  '#e3c0e8'
]
