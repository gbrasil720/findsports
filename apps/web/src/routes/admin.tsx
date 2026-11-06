import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Outlet } from '@tanstack/react-router'
import { useState } from 'react'
import {
  useMyBar,
  useMyEvents,
  useMySubscription
} from '@/components/admin/admin-queries'
import {
  type AnalyticsPeriodPreset,
  getAnalyticsRange
} from '@/components/admin/analytics-period'
import { QueryError } from '@/components/admin/query-error'
import { useMinuteNow } from '@/components/app/minute-tick'
import { PainelContext, PainelShell } from '@/components/painel/painel-shell'
import { getEventTemporalState } from '@/domain/events'
import { getShownPlan } from '@/lib/lapsed-plan'
import { PWA_LINKS, PWA_META } from '@/lib/pwa'
import { BAR_RESERVATIONS_QUERY } from '@/lib/query-cache'
import { getUserFacingMessage, isRetryableError } from '@/lib/user-facing-error'
import { useTRPC } from '@/utils/trpc'

/*
 * Painel do bar (WEB-501): layout de `/admin/*` com a casca nova. Cada seção
 * é uma rota filha; os links antigos por hash (`/admin#admin-espaco`) são
 * levados à rota nova em `admin.index.tsx`. Os guardas de sessão e papel são
 * os da raiz (`applyAuthGuards`).
 */
export const Route = createFileRoute('/admin')({
  head: () => ({
    meta: [
      { title: 'Painel do Bar — Onside' },
      {
        name: 'description',
        content:
          'Gerencie a programação de jogos do seu bar e atraia torcedores perto de você.'
      },
      { name: 'robots', content: 'noindex' },
      ...PWA_META
    ],
    links: [...PWA_LINKS]
  }),
  component: AdminLayout
})

function AdminLayout() {
  const trpc = useTRPC()
  const now = useMinuteNow()
  const [analyticsRange, setAnalyticsRange] = useState(() =>
    getAnalyticsRange('30d')
  )
  const [analyticsPreset, setAnalyticsPreset] =
    useState<AnalyticsPeriodPreset>('30d')
  const [validating, setValidating] = useState(false)

  const barQuery = useMyBar()
  const { data: subscription, isFetched: subscriptionFetched } =
    useMySubscription()
  const { data: events } = useMyEvents()
  const { data: hasOpenReservations, isFetched: openFetched } = useQuery({
    ...trpc.barReservations.hasOpen.queryOptions(),
    meta: { errorToast: false }
  })

  // O servidor confere o plano de novo; aqui só decide se a seção existe.
  const elite = subscription?.currentPlan === 'elite'
  // Código em aberto segura Quem vai de quem perdeu o Elite (WEB-341).
  const showsGoing = elite || hasOpenReservations === true
  const goingKnown = subscriptionFetched && (elite || openFetched)
  const { data: going } = useQuery({
    ...trpc.barReservations.going.queryOptions(),
    ...BAR_RESERVATIONS_QUERY,
    enabled: showsGoing,
    meta: { errorToast: false }
  })

  const bar = barQuery.data
  const upcomingGames = events
    ? events.filter(
        (event) =>
          getEventTemporalState(event.startsAt, event.endsAt, now) !== 'past'
      ).length
    : null
  const goingCount = going
    ? going.reduce((sum, game) => sum + game.people.length, 0)
    : null

  return (
    <PainelContext.Provider
      value={{
        analyticsRange,
        setAnalyticsRange,
        analyticsPreset,
        setAnalyticsPreset,
        showsGoing,
        goingKnown,
        elite
      }}
    >
      <PainelShell
        barName={bar?.name ?? ''}
        neighborhood={bar?.neighborhood ?? ''}
        planName={
          subscription !== undefined ? getShownPlan(subscription).name : null
        }
        upcomingGames={upcomingGames}
        goingCount={goingCount}
        validating={validating}
        onValidate={() => setValidating(true)}
        onCloseValidation={() => setValidating(false)}
      >
        {barQuery.isLoading ? (
          <div className="pn-skel" role="status" aria-busy="true">
            <span className="sr-only">Carregando painel do bar…</span>
            <i />
            <i />
            <i />
          </div>
        ) : barQuery.isError || !bar ? (
          <div className="onside-app pn-legado">
            <QueryError
              message={getUserFacingMessage(
                barQuery.error,
                'Não foi possível carregar os dados do bar.'
              )}
              retryable={isRetryableError(barQuery.error)}
              onRetry={() => {
                void barQuery.refetch()
              }}
            />
          </div>
        ) : (
          <Outlet />
        )}
      </PainelShell>
    </PainelContext.Provider>
  )
}
