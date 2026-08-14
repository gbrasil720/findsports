import { Skeleton } from '@findsports_oficial/ui/components/skeleton'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import AlertCircle from 'reicon-react/icons/AlertCircle'
import ArrowRight from 'reicon-react/icons/ArrowRight'
import CircleInfo from 'reicon-react/icons/CircleInfo'
import Loader from 'reicon-react/icons/Loader'
import type {
  EventsState,
  PlanState,
  PolicyState
} from '@/components/admin/admin-model'
import {
  type AdminSectionId,
  AdminTabs,
  getAdminSectionFromHash,
  getAdminTabId
} from '@/components/admin/admin-tabs'
import { BarPreview } from '@/components/admin/bar-preview'
import { EventsManager } from '@/components/admin/events-manager'
import { PubHeroSection } from '@/components/admin/pub-hero-section'
import { AppShell } from '@/components/app/app-shell'
import { getEventTemporalState } from '@/domain/events'
import { analytics } from '@/lib/analytics'
import { useTRPC } from '@/utils/trpc'

export const Route = createFileRoute('/admin')({
  head: () => ({
    meta: [
      { title: 'Painel do Bar — Onside' },
      {
        name: 'description',
        content:
          'Gerencie a programação de jogos do seu bar e atraia torcedores perto de você.'
      },
      { name: 'robots', content: 'noindex' }
    ]
  }),
  component: PubDashboard
})

const PLAN_LABEL: Record<string, string> = {
  starter: 'Starter',
  pro: 'Pro',
  elite: 'Elite'
}

function QueryError({
  message,
  onRetry
}: {
  message: string
  onRetry: () => void
}) {
  return (
    <div className="onside-callout onside-callout-danger" role="alert">
      <AlertCircle
        size={20}
        color="currentColor"
        className="mt-0.5 shrink-0"
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <p className="mb-0.5 font-semibold text-sm">{message}</p>
        <p className="text-sm opacity-90">
          Tente novamente. Se o problema continuar, volte mais tarde.
        </p>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="onside-btn onside-btn-ink shrink-0 min-h-11 px-4 text-xs"
      >
        Tentar de novo
      </button>
    </div>
  )
}

function PubDashboard() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [, setTick] = useState(0)
  const [activeSection, setActiveSection] =
    useState<AdminSectionId>('admin-visao')
  const [profileError, setProfileError] = useState<string | null>(null)
  const inactiveTracked = useRef(false)
  const limitTracked = useRef(false)

  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 60_000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    analytics.adminViewed()
  }, [])

  useEffect(() => {
    const syncSectionFromHash = () => {
      const section = getAdminSectionFromHash(window.location.hash)
      if (section) setActiveSection(section)
    }

    syncSectionFromHash()
    window.addEventListener('hashchange', syncSectionFromHash)
    return () => window.removeEventListener('hashchange', syncSectionFromHash)
  }, [])

  const changeSection = (section: AdminSectionId) => {
    setActiveSection(section)
    const nextHash = `#${section}`
    if (window.location.hash !== nextHash) {
      window.history.replaceState(null, '', nextHash)
    }
  }

  const {
    data: bar,
    isLoading: loadingBar,
    isError: barError,
    refetch: refetchBar
  } = useQuery(trpc.pub.getMe.queryOptions())

  const {
    data: events,
    isLoading: loadingEvents,
    isError: eventsError,
    refetch: refetchEvents
  } = useQuery(trpc.pub.getMyEvents.queryOptions())

  const {
    data: subscription,
    isLoading: loadingSub,
    isError: subError,
    isFetched: subFetched,
    refetch: refetchSub
  } = useQuery(trpc.pub.getMySubscription.queryOptions())

  const {
    data: creationPolicy,
    isLoading: loadingPolicy,
    isError: policyError,
    refetch: refetchPolicy
  } = useQuery(trpc.pub.getMyEventCreationPolicy.queryOptions())

  const updateMeMutation = useMutation(
    trpc.pub.updateMe.mutationOptions({
      onSuccess: () => {
        setProfileError(null)
        queryClient.invalidateQueries({ queryKey: trpc.pub.getMe.queryKey() })
      },
      onError: (err) => {
        setProfileError(
          err.message || 'Não foi possível salvar o perfil. Tente novamente.'
        )
      }
    })
  )

  const eventsState: EventsState = loadingEvents
    ? { status: 'loading' }
    : eventsError || !events
      ? {
          status: 'error',
          retry: () => {
            void refetchEvents()
          }
        }
      : { status: 'ready', events }
  const policyState: PolicyState = loadingPolicy
    ? { status: 'loading' }
    : policyError || !creationPolicy
      ? {
          status: 'error',
          retry: () => {
            void refetchPolicy()
          }
        }
      : { status: 'ready', policy: creationPolicy }
  const planState: PlanState = loadingSub
    ? { status: 'loading' }
    : subError
      ? { status: 'error' }
      : { status: 'ready', plan: subscription?.plan ?? 'starter' }

  const eventList = eventsState.status === 'ready' ? eventsState.events : []
  const liveEvent = eventList.find(
    (item) => getEventTemporalState(item.startsAt) === 'live'
  )
  const totalCount = eventList.length
  const isInactive = bar ? !bar.isActive : false

  const planKnown = subFetched && !loadingSub && !subError
  const plan = planKnown ? (subscription?.plan ?? 'starter') : null
  const planLabel = plan ? (PLAN_LABEL[plan] ?? plan) : null
  const isStarter = plan === 'starter'
  const limitedPolicy =
    creationPolicy?.status === 'limited' ? creationPolicy : null
  const eventsUsed = limitedPolicy?.used ?? 0
  const eventsRemaining = limitedPolicy?.remaining ?? null
  const isNearLimit = isStarter && eventsRemaining === 1
  const isAtLimit = limitedPolicy ? !limitedPolicy.canCreate : false

  useEffect(() => {
    if (isInactive && !inactiveTracked.current) {
      analytics.barInactiveWarningShown()
      inactiveTracked.current = true
    }
  }, [isInactive])

  useEffect(() => {
    if (isAtLimit && !limitTracked.current) {
      analytics.eventLimitReached()
      limitTracked.current = true
    }
  }, [isAtLimit])

  if (loadingBar) {
    return (
      <AppShell variant="pub">
        <div className="space-y-6 py-6" aria-busy="true" aria-live="polite">
          <Skeleton className="h-10 w-48 bg-[var(--onside-stone)]" />
          <Skeleton className="h-6 w-32 bg-[var(--onside-stone)]" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Skeleton className="h-24 bg-[var(--onside-stone)]" />
            <Skeleton className="h-24 bg-[var(--onside-stone)]" />
            <Skeleton className="h-24 bg-[var(--onside-stone)]" />
          </div>
          <div className="flex items-center gap-2 text-[var(--onside-muted)] text-sm">
            <Loader
              size={18}
              color="currentColor"
              className="animate-spin"
              aria-hidden="true"
            />
            Carregando painel…
          </div>
        </div>
      </AppShell>
    )
  }

  if (barError || !bar) {
    return (
      <AppShell variant="pub">
        <QueryError
          message="Não foi possível carregar os dados do bar."
          onRetry={() => {
            void refetchBar()
          }}
        />
      </AppShell>
    )
  }

  return (
    <AppShell variant="pub" userMeta={bar.name}>
      <div className="mb-6 border-[var(--onside-ink)] border-b pb-4">
        <p className="onside-kicker mb-2">Onside para bares</p>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="onside-display text-4xl md:text-5xl">Sua grade</h1>
            <p className="mt-2 font-[family-name:var(--onside-mono)] text-[11px] text-[var(--onside-muted)] uppercase tracking-[0.12em]">
              {bar.name}
            </p>
          </div>
        </div>
      </div>

      <div className="onside-admin-grid">
        <AdminTabs activeSection={activeSection} onChange={changeSection} />

        <div className="min-w-0">
          <section
            id="admin-visao"
            role="tabpanel"
            aria-labelledby={getAdminTabId('admin-visao')}
            hidden={activeSection !== 'admin-visao'}
            className="space-y-4"
          >
            <div>
              <h2 className="onside-display text-2xl">Visão geral</h2>
              <p className="mt-1 text-sm text-[var(--onside-muted)]">
                Acompanhe a visibilidade, o plano e a programação do seu bar.
              </p>
            </div>

            {subError && (
              <QueryError
                message="Não foi possível carregar a assinatura."
                onRetry={() => {
                  void refetchSub()
                }}
              />
            )}

            {eventsError && (
              <QueryError
                message="Não foi possível carregar os eventos."
                onRetry={() => {
                  void refetchEvents()
                }}
              />
            )}

            {policyError && (
              <QueryError
                message="Não foi possível verificar a disponibilidade de eventos."
                onRetry={() => {
                  void refetchPolicy()
                }}
              />
            )}

            {isInactive && (
              <div className="onside-callout onside-callout-warn">
                <AlertCircle
                  size={20}
                  color="currentColor"
                  className="mt-0.5 shrink-0"
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <p className="mb-0.5 font-semibold text-sm">
                    Seu bar não está visível na plataforma
                  </p>
                  <p className="text-sm opacity-90">
                    Nenhum plano ou período de teste ativo. Ative um plano para
                    aparecer nas buscas e no mapa.
                  </p>
                </div>
                <Link
                  to="/plan"
                  className="onside-btn onside-btn-ink shrink-0 min-h-11 px-4 text-xs"
                >
                  Ver planos
                  <ArrowRight
                    size={13}
                    color="currentColor"
                    aria-hidden="true"
                  />
                </Link>
              </div>
            )}

            {isStarter && !isInactive && eventsRemaining !== null && (
              <div
                className={`onside-callout ${
                  isAtLimit
                    ? 'onside-callout-danger'
                    : isNearLimit
                      ? 'onside-callout-warn'
                      : 'onside-callout-acid'
                }`}
              >
                {isAtLimit || isNearLimit ? (
                  <AlertCircle
                    size={20}
                    color="currentColor"
                    className="mt-0.5 shrink-0"
                    aria-hidden="true"
                  />
                ) : (
                  <CircleInfo
                    size={20}
                    color="currentColor"
                    className="mt-0.5 shrink-0"
                    aria-hidden="true"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="mb-0.5 font-semibold text-sm">
                    {isAtLimit
                      ? 'Limite de jogos atingido este mês'
                      : isNearLimit
                        ? 'Último jogo disponível no plano Starter'
                        : `Plano Starter — ${eventsRemaining} de ${limitedPolicy?.limit ?? 0} jogos restantes`}
                  </p>
                  <p className="text-sm opacity-90">
                    {isAtLimit
                      ? 'Faça upgrade para o plano Pro e cadastre jogos ilimitados.'
                      : isNearLimit
                        ? 'Considere fazer upgrade para o Pro antes de atingir o limite.'
                        : `Você usou ${eventsUsed} jogo${eventsUsed !== 1 ? 's' : ''} neste período de cobrança.`}
                  </p>
                </div>
                {(isAtLimit || isNearLimit) && (
                  <Link
                    to="/plan"
                    className="onside-btn onside-btn-ink shrink-0 min-h-11 px-4 text-xs"
                  >
                    Fazer upgrade
                    <ArrowRight
                      size={13}
                      color="currentColor"
                      aria-hidden="true"
                    />
                  </Link>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="onside-stat">
                <div className="onside-stat-value tabular-nums">
                  {loadingEvents ? '…' : totalCount}
                </div>
                <div className="onside-stat-label">Transmissões</div>
              </div>
              <div className="onside-stat">
                <div className="onside-stat-value tabular-nums">
                  {loadingEvents ? '…' : liveEvent ? 1 : 0}
                </div>
                <div className="onside-stat-label">Ao vivo</div>
              </div>
              <div className="onside-stat">
                <div className="onside-stat-value uppercase">
                  {loadingSub ? '…' : (planLabel ?? '—')}
                </div>
                <div className="onside-stat-label">
                  {isStarter && eventsRemaining !== null
                    ? `${eventsRemaining} restantes`
                    : 'Plano atual'}
                </div>
              </div>
            </div>
          </section>

          <section
            id="admin-grade"
            role="tabpanel"
            aria-labelledby={getAdminTabId('admin-grade')}
            hidden={activeSection !== 'admin-grade'}
          >
            <EventsManager
              eventsState={eventsState}
              policyState={policyState}
            />
          </section>

          <section
            id="admin-espaco"
            role="tabpanel"
            aria-labelledby={getAdminTabId('admin-espaco')}
            hidden={activeSection !== 'admin-espaco'}
            className="space-y-6"
          >
            <PubHeroSection
              bar={bar}
              liveEvent={liveEvent}
              totalCount={totalCount}
              isSaving={updateMeMutation.isPending}
              saveError={profileError}
              onSave={async (data) => {
                setProfileError(null)
                await updateMeMutation.mutateAsync({
                  name: data.name || undefined,
                  address: data.address || undefined,
                  neighborhood: data.neighborhood || undefined,
                  city: data.city || undefined,
                  phone: data.phone || undefined,
                  description: data.description || undefined
                })
              }}
              onPhotoUpdate={() => {
                queryClient.invalidateQueries({
                  queryKey: trpc.pub.getMe.queryKey()
                })
              }}
            />

            <BarPreview
              bar={{
                id: bar.id,
                name: bar.name,
                neighborhood: bar.neighborhood,
                city: bar.city,
                latitude: bar.latitude,
                longitude: bar.longitude,
                photoUrl: bar.photoUrl
              }}
              eventsState={eventsState}
              planState={planState}
            />
          </section>
        </div>
      </div>
    </AppShell>
  )
}
