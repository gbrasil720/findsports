import { useQuery } from '@tanstack/react-query'
import {
  createFileRoute,
  Outlet,
  useNavigate,
  useRouter
} from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  useMyBar,
  useMyEvents,
  useMySubscription
} from '@/components/admin/admin-queries'
import {
  type AnalyticsPeriodPreset,
  getAnalyticsRange
} from '@/components/admin/analytics-period'
import { useMinuteNow } from '@/components/app/minute-tick'
import { PainelContext, PainelShell } from '@/components/painel/painel-shell'
import { PasseioProvider } from '@/components/painel/passeio'
import { getEventTemporalState } from '@/domain/events'
import { getShownPlan } from '@/lib/lapsed-plan'
import { PWA_LINKS, PWA_META } from '@/lib/pwa'
import { BAR_RESERVATIONS_QUERY } from '@/lib/query-cache'
import { precisaEscolherPlano } from '@/lib/trial-plan-choice'
import { getUserFacingMessage, isRetryableError } from '@/lib/user-facing-error'
import { PUB_LIVE_PATH } from '@/utils/auth-guards'
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

/**
 * As telas do painel baixam já na abertura (WEB-470): sem rede, a troca de
 * tela não acha o código da próxima e o router recarrega a página inteira,
 * que cai na página offline do service worker.
 */
function usePainelChunks() {
  const router = useRouter()
  useEffect(() => {
    for (const route of Object.values(router.routesById))
      if (route.id.startsWith('/admin/'))
        router.loadRouteChunk(route)?.catch(() => {})
  }, [router])
}

function AdminLayout() {
  usePainelChunks()
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
  // O bar do cadastro que ainda não escolheu o plano do teste vai à escolha
  // antes do painel: é o único passo do cadastro que não dá para pular.
  const navigate = useNavigate()
  const escolherPlano =
    bar !== undefined &&
    subscription !== undefined &&
    precisaEscolherPlano(bar, subscription)
  useEffect(() => {
    if (!escolherPlano) return
    toast.info('Antes do painel, escolha o plano do teste.')
    void navigate({
      to: PUB_LIVE_PATH,
      search: { passo: 'plano' },
      replace: true
    })
  }, [escolherPlano, navigate])
  const upcomingGames = events
    ? events.filter(
        (event) =>
          event.publishedAt !== null &&
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
        elite,
        openValidation: () => setValidating(true)
      }}
    >
      <PasseioProvider>
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
          {barQuery.isLoading || escolherPlano ? (
            <div className="pn-skel" role="status" aria-busy="true">
              <span className="sr-only">Carregando painel do bar…</span>
              <i />
              <i />
              <i />
            </div>
          ) : barQuery.isError || !bar ? (
            <div className="pn-err" role="alert">
              <p>
                {getUserFacingMessage(
                  barQuery.error,
                  'Não foi possível carregar os dados do bar.'
                )}
              </p>
              {isRetryableError(barQuery.error) ? (
                <button
                  type="button"
                  className="pn-btn pn-ghost pn-sm"
                  onClick={() => void barQuery.refetch()}
                >
                  Tentar de novo
                </button>
              ) : null}
            </div>
          ) : (
            <Outlet />
          )}
        </PainelShell>
      </PasseioProvider>
    </PainelContext.Provider>
  )
}
