import type { EventComparisonTarget } from '@findsports_oficial/api/lib/commercial-analytics/types'
import { Skeleton } from '@findsports_oficial/ui/components/skeleton'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { Activity, useEffect, useRef, useState } from 'react'
import AlertCircle from 'reicon-react/icons/AlertCircle'
import ArrowRight from 'reicon-react/icons/ArrowRight'
import CircleInfo from 'reicon-react/icons/CircleInfo'
import { AccountSettings } from '@/components/account/account-settings'
import type {
  AnalyticsEntitlementsData,
  AnalyticsOverviewState,
  EventAnalyticsState,
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
import { AnalyticsOverview } from '@/components/admin/analytics-overview'
import {
  type AnalyticsDateRange,
  type AnalyticsPeriodPreset,
  formatAnalyticsPeriod,
  getAnalyticsRange,
  getAvailableAnalyticsPeriods
} from '@/components/admin/analytics-period'
import { BarPreview } from '@/components/admin/bar-preview'
import { ConversionReadiness } from '@/components/admin/conversion-readiness'
import { EventPerformance } from '@/components/admin/event-performance'
import { EventsManager } from '@/components/admin/events-manager'
import { PubHeroSection } from '@/components/admin/pub-hero-section'
import { RatingsPanel } from '@/components/admin/ratings-panel'
import { RecommendationQualityStatus } from '@/components/admin/recommendation-quality-status'
import { AppShell } from '@/components/app/app-shell'
import { InstallAppCard } from '@/components/app/install-app-card'
import { useMinuteNow } from '@/components/app/minute-tick'
import { getEventTemporalState } from '@/domain/events'
import { analytics } from '@/lib/analytics'
import { PWA_LINKS, PWA_META } from '@/lib/pwa'
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
      { name: 'robots', content: 'noindex' },
      ...PWA_META
    ],
    links: [...PWA_LINKS]
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

/* ------------------------------------------------------------------ */
/* Analytics date helpers                                              */
/* ------------------------------------------------------------------ */

function getAnalyticsDates(): AnalyticsDateRange {
  return getAnalyticsRange('30d')
}

function AnalyticsPeriodSelector({
  entitlements,
  loadingEntitlements,
  entitlementsError,
  onRetryEntitlements,
  range,
  preset,
  customRange,
  customError,
  isFetching,
  onPresetChange,
  onCustomRangeChange,
  onApplyCustom
}: {
  entitlements?: AnalyticsEntitlementsData
  loadingEntitlements: boolean
  entitlementsError: boolean
  onRetryEntitlements: () => void
  range: AnalyticsDateRange
  preset: AnalyticsPeriodPreset
  customRange: AnalyticsDateRange
  customError: string | null
  isFetching: boolean
  onPresetChange: (preset: AnalyticsPeriodPreset) => void
  onCustomRangeChange: (field: 'from' | 'to', value: string) => void
  onApplyCustom: () => void
}) {
  const availablePeriods = entitlements
    ? getAvailableAnalyticsPeriods(entitlements.maxDaysRetention)
    : []

  return (
    <section
      className="onside-panel-acid mb-6 p-4"
      aria-label="Período das analytics"
      aria-busy={loadingEntitlements || isFetching}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="onside-label mb-1 text-[var(--onside-ink)] opacity-70">
            Janela consultada
          </p>
          <p className="font-semibold text-[var(--onside-ink)] text-sm">
            {formatAnalyticsPeriod(range.from, range.to)}
          </p>
          <div className="mt-1 text-[var(--onside-ink)] text-xs opacity-60">
            {loadingEntitlements ? (
              <Skeleton className="h-3 w-36 bg-[var(--onside-ink)]/20" />
            ) : entitlements ? (
              entitlements.maxDaysRetention === null ? (
                'Seu plano permite todo o histórico disponível.'
              ) : (
                `Seu plano permite até ${entitlements.maxDaysRetention} dias.`
              )
            ) : (
              'Não foi possível verificar o limite do seu plano.'
            )}
          </div>
        </div>
        {isFetching && (
          <span className="text-[var(--onside-ink)] text-xs" role="status">
            Atualizando…
          </span>
        )}
      </div>

      {loadingEntitlements ? (
        <div className="mt-4" role="status" aria-live="polite">
          <span className="sr-only">Carregando períodos disponíveis…</span>
          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-11 w-20 bg-[var(--onside-ink)]/20" />
            <Skeleton className="h-11 w-24 bg-[var(--onside-ink)]/20" />
            <Skeleton className="h-11 w-28 bg-[var(--onside-ink)]/20" />
            <Skeleton className="h-11 w-32 bg-[var(--onside-ink)]/20" />
          </div>
        </div>
      ) : entitlementsError ? (
        <div className="onside-callout onside-callout-danger mt-4" role="alert">
          <p className="flex-1 text-sm">
            Não foi possível carregar os períodos disponíveis.
          </p>
          <button
            type="button"
            onClick={onRetryEntitlements}
            className="onside-btn onside-btn-ink shrink-0 min-h-11 px-4 text-xs"
          >
            Tentar de novo
          </button>
        </div>
      ) : (
        <>
          <fieldset className="mt-4 border-0 p-0">
            <legend className="onside-label mb-2 text-[var(--onside-ink)] opacity-70">
              Atalho
            </legend>
            <div className="flex flex-wrap gap-2">
              {availablePeriods.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={preset === option.id}
                  onClick={() => onPresetChange(option.id)}
                  className={`onside-btn min-h-11 px-4 text-xs ${preset === option.id ? 'onside-btn-ink' : 'onside-btn-outline'}`}
                >
                  {option.label}
                </button>
              ))}
              <button
                type="button"
                aria-pressed={preset === 'custom'}
                onClick={() => onPresetChange('custom')}
                className={`onside-btn min-h-11 px-4 text-xs ${preset === 'custom' ? 'onside-btn-ink' : 'onside-btn-outline'}`}
              >
                Personalizado
              </button>
            </div>
          </fieldset>

          {preset === 'custom' && (
            <form
              className="mt-4 grid grid-cols-1 items-end gap-3 sm:grid-cols-[1fr_1fr_auto]"
              onSubmit={(event) => {
                event.preventDefault()
                onApplyCustom()
              }}
            >
              <label className="block">
                <span className="onside-label mb-1.5 block">De</span>
                <input
                  type="date"
                  value={customRange.from}
                  onChange={(event) =>
                    onCustomRangeChange('from', event.target.value)
                  }
                  className="onside-input"
                  aria-label="Data inicial"
                />
              </label>
              <label className="block">
                <span className="onside-label mb-1.5 block">Até</span>
                <input
                  type="date"
                  value={customRange.to}
                  onChange={(event) =>
                    onCustomRangeChange('to', event.target.value)
                  }
                  className="onside-input"
                  aria-label="Data final"
                />
              </label>
              <button
                type="submit"
                className="onside-btn onside-btn-ink min-h-11"
              >
                Consultar período
              </button>
              {customError && (
                <p
                  className="text-[var(--onside-live-text)] text-xs sm:col-span-3"
                  role="alert"
                >
                  {customError}
                </p>
              )}
            </form>
          )}
        </>
      )}
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

function AdminDashboardSkeleton() {
  return (
    <div
      className="space-y-6 py-6"
      role="status"
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">Carregando painel do bar…</span>
      <div className="border-[var(--onside-ink)] border-b pb-4">
        <Skeleton className="mb-3 h-3 w-32 bg-[var(--onside-stone)]" />
        <Skeleton className="h-12 w-48 bg-[var(--onside-stone)]" />
        <Skeleton className="mt-3 h-3 w-32 bg-[var(--onside-stone)]" />
      </div>
      <div className="onside-admin-grid">
        <nav className="onside-admin-nav" aria-hidden="true">
          <div className="space-y-2">
            <Skeleton className="h-11 w-full bg-[var(--onside-stone)]" />
            <Skeleton className="h-11 w-full bg-[var(--onside-stone)]" />
            <Skeleton className="h-11 w-full bg-[var(--onside-stone)]" />
            <Skeleton className="h-11 w-full bg-[var(--onside-stone)]" />
          </div>
          <Skeleton className="mt-4 h-11 w-full bg-[var(--onside-stone)]" />
        </nav>
        <div className="min-w-0 space-y-4">
          <div>
            <Skeleton className="mb-2 h-8 w-36 bg-[var(--onside-stone)]" />
            <Skeleton className="h-4 w-72 max-w-full bg-[var(--onside-stone)]" />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[1, 2, 3].map((item) => (
              <div key={item} className="onside-stat" aria-hidden="true">
                <Skeleton className="mb-3 h-3 w-24 bg-[var(--onside-stone)]" />
                <Skeleton className="h-10 w-14 bg-[var(--onside-stone)]" />
                <Skeleton className="mt-2 h-3 w-20 bg-[var(--onside-stone)]" />
              </div>
            ))}
          </div>
          <div className="onside-panel-acid space-y-4 p-4" aria-hidden="true">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-2">
                <Skeleton className="h-3 w-28 bg-[var(--onside-stone)]" />
                <Skeleton className="h-4 w-40 bg-[var(--onside-stone)]" />
              </div>
              <Skeleton className="h-3 w-20 bg-[var(--onside-stone)]" />
            </div>
            <div className="flex flex-wrap gap-2">
              <Skeleton className="h-11 w-20 bg-[var(--onside-stone)]" />
              <Skeleton className="h-11 w-24 bg-[var(--onside-stone)]" />
              <Skeleton className="h-11 w-28 bg-[var(--onside-stone)]" />
              <Skeleton className="h-11 w-32 bg-[var(--onside-stone)]" />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="onside-panel-acid p-4">
              <Skeleton className="mb-3 h-5 w-36 bg-[var(--onside-stone)]" />
              <Skeleton className="h-40 w-full bg-[var(--onside-stone)]" />
            </div>
            <div className="onside-panel-acid p-4">
              <Skeleton className="mb-3 h-5 w-40 bg-[var(--onside-stone)]" />
              <Skeleton className="h-10 w-full bg-[var(--onside-stone)]" />
              <Skeleton className="mt-3 h-10 w-full bg-[var(--onside-stone)]" />
              <Skeleton className="mt-3 h-10 w-full bg-[var(--onside-stone)]" />
            </div>
          </div>
          <div className="onside-panel-acid p-4" aria-hidden="true">
            <Skeleton className="mb-3 h-5 w-44 bg-[var(--onside-stone)]" />
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {[1, 2, 3, 4].map((item) => (
                <div key={item} className="space-y-2">
                  <Skeleton className="h-3 w-16 bg-[var(--onside-stone)]" />
                  <Skeleton className="h-6 w-12 bg-[var(--onside-stone)]" />
                  <Skeleton className="h-3 w-14 bg-[var(--onside-stone)]" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function PubDashboard() {
  const session = Route.useRouteContext({ select: (ctx) => ctx.session })
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const now = useMinuteNow()
  const [activeSection, setActiveSection] =
    useState<AdminSectionId>('admin-visao')
  const [eventComparisonTarget, setEventComparisonTarget] = useState<
    EventComparisonTarget | undefined
  >()
  const [profileError, setProfileError] = useState<string | null>(null)
  const limitTracked = useRef(false)

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

  /* ------------------------------------------------------------------ */
  /* Queries                                                             */
  /* ------------------------------------------------------------------ */

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
    data: ratings,
    isLoading: loadingRatings,
    isError: ratingsError,
    refetch: refetchRatings
  } = useQuery(trpc.pub.getMyRatings.queryOptions())

  const {
    data: recommendationQualityStatus,
    isLoading: loadingRecommendationQuality,
    isError: recommendationQualityError,
    refetch: refetchRecommendationQuality
  } = useQuery(trpc.recommendations.getMyBarQualityStatus.queryOptions())

  const {
    data: subscription,
    isLoading: loadingSub,
    isError: subError,
    isFetched: subFetched,
    refetch: refetchSub
  } = useQuery(trpc.pub.getMySubscription.queryOptions())

  const {
    data: analyticsEntitlements,
    isLoading: loadingEntitlements,
    isError: entitlementsError,
    refetch: refetchEntitlements
  } = useQuery(trpc.commercialAnalytics.getMyEntitlements.queryOptions())

  const [analyticsDates, setAnalyticsDates] = useState(getAnalyticsDates)
  const [analyticsPreset, setAnalyticsPreset] =
    useState<AnalyticsPeriodPreset>('30d')
  const [customAnalyticsDates, setCustomAnalyticsDates] =
    useState<AnalyticsDateRange>(analyticsDates)
  const [customAnalyticsError, setCustomAnalyticsError] = useState<
    string | null
  >(null)

  const handleAnalyticsPresetChange = (preset: AnalyticsPeriodPreset) => {
    if (preset === 'custom') {
      setAnalyticsPreset(preset)
      setCustomAnalyticsError(null)
      return
    }

    if (
      !analyticsEntitlements ||
      !getAvailableAnalyticsPeriods(
        analyticsEntitlements.maxDaysRetention
      ).some((option) => option.id === preset)
    ) {
      return
    }

    setAnalyticsDates(getAnalyticsRange(preset))
    setAnalyticsPreset(preset)
    setCustomAnalyticsError(null)
  }

  const handleCustomAnalyticsRangeChange = (
    field: 'from' | 'to',
    value: string
  ) => {
    setCustomAnalyticsDates((current) => ({ ...current, [field]: value }))
    setCustomAnalyticsError(null)
  }

  const applyCustomAnalyticsRange = () => {
    if (!customAnalyticsDates.from || !customAnalyticsDates.to) {
      setCustomAnalyticsError('Informe as duas datas do período.')
      return
    }
    if (customAnalyticsDates.from > customAnalyticsDates.to) {
      setCustomAnalyticsError(
        'A data inicial deve ser anterior ou igual à data final.'
      )
      return
    }

    setAnalyticsDates(customAnalyticsDates)
    setAnalyticsPreset('custom')
  }

  const {
    data: creationPolicy,
    isLoading: loadingPolicy,
    isError: policyError,
    refetch: refetchPolicy
  } = useQuery(trpc.pub.getMyEventCreationPolicy.queryOptions())

  /* Analytics queries */
  const periodStart = Date.parse(analyticsDates.from)
  const periodEnd = Date.parse(analyticsDates.to)
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
    data: analyticsOverview,
    isLoading: loadingAnalytics,
    isError: analyticsError,
    error: analyticsOverviewError,
    isFetching: fetchingAnalytics,
    refetch: refetchAnalytics
  } = useQuery(
    trpc.commercialAnalytics.getMyAnalyticsOverview.queryOptions({
      from: analyticsDates.from,
      to: analyticsDates.to
    })
  )

  const {
    data: eventAnalytics,
    isLoading: loadingEventAnalytics,
    isFetching: fetchingEventAnalytics,
    isError: eventAnalyticsError,
    error: eventAnalyticsQueryError,
    refetch: refetchEventAnalytics
  } = useQuery(
    trpc.commercialAnalytics.getMyEventAnalytics.queryOptions({
      from: analyticsDates.from,
      to: analyticsDates.to,
      ...(requestedComparisonTarget
        ? { comparisonTarget: requestedComparisonTarget }
        : {})
    })
  )

  /* Mutations */
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

  /* ------------------------------------------------------------------ */
  /* State machines                                                      */
  /* ------------------------------------------------------------------ */

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

  /* Analytics overview state machine */
  const analyticsOverviewState: AnalyticsOverviewState = loadingAnalytics
    ? { status: 'loading' }
    : analyticsError
      ? {
          status: 'error',
          message: analyticsOverviewError?.message,
          retry: () => {
            void refetchAnalytics()
          }
        }
      : analyticsOverview
        ? { status: 'ready', data: analyticsOverview }
        : { status: 'empty' }

  /* Event analytics state machine — o entitlement (não o plano) é autoritativo */
  const eventAnalyticsState: EventAnalyticsState = loadingEntitlements
    ? { status: 'loading' }
    : entitlementsError || !analyticsEntitlements
      ? {
          status: 'error',
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
                message: eventAnalyticsQueryError?.message,
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

  /* ------------------------------------------------------------------ */
  /* Derived                                                             */
  /* ------------------------------------------------------------------ */

  const eventList = eventsState.status === 'ready' ? eventsState.events : []
  const hasUpcomingEvent = eventList.some(
    (e) => getEventTemporalState(e.startsAt, e.endsAt, now) === 'upcoming'
  )
  const liveEvent = eventList.find(
    (item) => getEventTemporalState(item.startsAt, item.endsAt, now) === 'live'
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
    if (isAtLimit && !limitTracked.current) {
      analytics.eventLimitReached()
      limitTracked.current = true
    }
  }, [isAtLimit])

  /* ------------------------------------------------------------------ */
  /* WhatsApp confirmation via updateMe                                  */
  /* ------------------------------------------------------------------ */

  const confirmWhatsAppMutation = useMutation(
    trpc.pub.updateMe.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: trpc.pub.getMe.queryKey() })
      },
      onError: (err) => {
        setProfileError(err.message || 'Não foi possível confirmar o WhatsApp.')
      }
    })
  )

  const handleConfirmWhatsApp = async () => {
    if (!bar?.phone) return
    setProfileError(null)
    await confirmWhatsAppMutation.mutateAsync({
      phone: bar.phone,
      phoneAcceptsWhatsapp: true
    })
  }

  /* ------------------------------------------------------------------ */
  /* Loading / Error                                                     */
  /* ------------------------------------------------------------------ */

  if (loadingBar) {
    return (
      <AppShell variant="pub">
        <AdminDashboardSkeleton />
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

  /* ------------------------------------------------------------------ */
  /* Render                                                              */
  /* ------------------------------------------------------------------ */

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
          {/* ============================================================ */}
          {/* Tab: Visão Geral                                              */}
          {/* ============================================================ */}
          <Activity
            mode={activeSection === 'admin-visao' ? 'visible' : 'hidden'}
          >
            <section
              id="admin-visao"
              role="tabpanel"
              aria-labelledby={getAdminTabId('admin-visao')}
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
                      Nenhum plano ou período de teste ativo. Ative um plano
                      para aparecer nas buscas e no mapa.
                    </p>
                  </div>
                  <Link
                    to="/plan"
                    search={{ origin: 'admin' }}
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

              <RecommendationQualityStatus
                status={recommendationQualityStatus}
                loading={loadingRecommendationQuality}
                error={recommendationQualityError}
                onRetry={() => {
                  void refetchRecommendationQuality()
                }}
              />

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
                      search={{ origin: 'admin' }}
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

              <div
                className="grid grid-cols-1 gap-3 sm:grid-cols-3"
                aria-busy={loadingEvents || loadingSub || undefined}
                aria-live="polite"
              >
                {loadingEvents || loadingSub ? (
                  <span className="sr-only">Carregando resumo do painel…</span>
                ) : null}
                <div className="onside-stat">
                  <div className="onside-stat-value tabular-nums">
                    {loadingEvents ? (
                      <Skeleton className="h-10 w-14" />
                    ) : (
                      totalCount
                    )}
                  </div>
                  <div className="onside-stat-label">Jogos na grade</div>
                </div>
                <div className="onside-stat">
                  <div className="onside-stat-value tabular-nums">
                    {loadingEvents ? (
                      <Skeleton className="h-10 w-14" />
                    ) : liveEvent ? (
                      1
                    ) : (
                      0
                    )}
                  </div>
                  <div className="onside-stat-label">Ao vivo</div>
                </div>
                <div className="onside-stat">
                  <div className="onside-stat-value uppercase">
                    {loadingSub ? (
                      <Skeleton className="h-7 w-24" />
                    ) : (
                      (planLabel ?? '—')
                    )}
                  </div>
                  <div className="onside-stat-label">
                    {isStarter && eventsRemaining !== null
                      ? `${eventsRemaining} restantes`
                      : 'Plano atual'}
                  </div>
                </div>
              </div>

              {/* Analytics Overview — real data */}
              <AnalyticsPeriodSelector
                entitlements={analyticsEntitlements}
                loadingEntitlements={loadingEntitlements}
                entitlementsError={entitlementsError}
                onRetryEntitlements={() => {
                  void refetchEntitlements()
                }}
                range={analyticsDates}
                preset={analyticsPreset}
                customRange={customAnalyticsDates}
                customError={customAnalyticsError}
                isFetching={fetchingAnalytics || fetchingEventAnalytics}
                onPresetChange={handleAnalyticsPresetChange}
                onCustomRangeChange={handleCustomAnalyticsRangeChange}
                onApplyCustom={applyCustomAnalyticsRange}
              />
              <AnalyticsOverview
                overviewState={analyticsOverviewState}
                onCreateEvent={() => changeSection('admin-grade')}
              />
            </section>
          </Activity>

          {/* ============================================================ */}
          {/* Tab: Grade                                                    */}
          {/* ============================================================ */}
          <Activity
            mode={activeSection === 'admin-grade' ? 'visible' : 'hidden'}
          >
            <section
              id="admin-grade"
              role="tabpanel"
              aria-labelledby={getAdminTabId('admin-grade')}
              className="space-y-6"
            >
              <EventsManager
                eventsState={eventsState}
                policyState={policyState}
              />

              {/* Event Performance — real data */}
              <EventPerformance eventAnalyticsState={eventAnalyticsState} />
            </section>
          </Activity>

          {/* ============================================================ */}
          {/* Tab: Meu Espaço                                               */}
          {/* ============================================================ */}
          <Activity
            mode={activeSection === 'admin-espaco' ? 'visible' : 'hidden'}
          >
            <section
              id="admin-espaco"
              role="tabpanel"
              aria-labelledby={getAdminTabId('admin-espaco')}
              className="space-y-6"
            >
              {/* Conversion Readiness */}
              <ConversionReadiness
                bar={bar}
                hasUpcomingEvent={hasUpcomingEvent}
                isConfirmingWhatsApp={confirmWhatsAppMutation.isPending}
                onConfirmWhatsApp={handleConfirmWhatsApp}
                onEditProfile={() => {
                  document
                    .getElementById('admin-profile-editor')
                    ?.scrollIntoView({ behavior: 'smooth' })
                }}
                onCreateEvent={() => changeSection('admin-grade')}
              />

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
                    description: data.description || undefined,
                    amenities: data.amenities,
                    screenCount: data.screenCount
                  })
                }}
                onPhotoUpdate={async (url: string) => {
                  // ESC-15: o arquivo agora sobe direto do navegador, então a
                  // rota de upload não grava mais nada. Quem persiste a URL é
                  // esta chamada — e o servidor confere que ela pertence ao
                  // armazenamento e à pasta deste bar antes de aceitar.
                  await updateMeMutation.mutateAsync({ photoUrl: url })
                  queryClient.invalidateQueries({
                    queryKey: trpc.pub.getMe.queryKey()
                  })
                }}
              />

              <RatingsPanel
                state={
                  loadingRatings
                    ? { status: 'loading' }
                    : ratingsError || !ratings
                      ? {
                          status: 'error',
                          retry: () => {
                            void refetchRatings()
                          }
                        }
                      : { status: 'ready', ratings }
                }
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
          </Activity>

          {/* ============================================================ */}
          {/* Tab: Configurações                                            */}
          {/* ============================================================ */}
          <Activity
            mode={
              activeSection === 'admin-configuracoes' ? 'visible' : 'hidden'
            }
          >
            <section
              id="admin-configuracoes"
              role="tabpanel"
              aria-labelledby={getAdminTabId('admin-configuracoes')}
            >
              <div className="mb-6">
                <h2 className="onside-display text-2xl">Configurações</h2>
                <p className="mt-1 text-sm text-[var(--onside-muted)]">
                  Gerencie a segurança da conta responsável por este bar.
                </p>
              </div>
              <AccountSettings surface="pub" />
            </section>
          </Activity>
        </div>

        {session ? (
          <InstallAppCard userId={session.user.id} surface="admin" />
        ) : null}
      </div>
    </AppShell>
  )
}
