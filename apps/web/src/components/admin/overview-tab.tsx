import { Skeleton } from '@findsports_oficial/ui/components/skeleton'
import { useIsFetching, useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import AlertCircle from 'reicon-react/icons/AlertCircle'
import ArrowRight from 'reicon-react/icons/ArrowRight'
import CircleInfo from 'reicon-react/icons/CircleInfo'
import { useMinuteNow } from '@/components/app/minute-tick'
import { getEventTemporalState } from '@/domain/events'
import { analytics } from '@/lib/analytics'
import { getLapsedPlan, LAPSED_LABEL } from '@/lib/lapsed-plan'
import { getUserFacingMessage, isRetryableError } from '@/lib/user-facing-error'
import { useTRPC } from '@/utils/trpc'
import type { AnalyticsOverviewState } from './admin-model'
import {
  useEventsState,
  useMyAnalyticsEntitlements,
  useMyBar,
  useMyEventCreationPolicy,
  useMyEvents,
  useMySubscription
} from './admin-queries'
import { AdminTabPanel } from './admin-tabs'
import { AnalyticsOverview } from './analytics-overview'
import {
  type AnalyticsDateRange,
  type AnalyticsPeriodPreset,
  getAnalyticsRange,
  getAvailableAnalyticsPeriods
} from './analytics-period'
import { AnalyticsPeriodSelector } from './analytics-period-selector'
import { QueryError } from './query-error'
import { RecommendationQualityStatus } from './recommendation-quality-status'

const PLAN_LABEL: Record<string, string> = {
  starter: 'Starter',
  pro: 'Pro',
  elite: 'Elite'
}

export function OverviewTab({
  active,
  analyticsRange,
  onAnalyticsRangeChange,
  onCreateEvent
}: {
  active: boolean
  // O período escolhido aqui também filtra o desempenho por jogo da aba Grade.
  analyticsRange: AnalyticsDateRange
  onAnalyticsRangeChange: (range: AnalyticsDateRange) => void
  onCreateEvent: () => void
}) {
  const trpc = useTRPC()
  const now = useMinuteNow()
  const limitTracked = useRef(false)

  const { data: bar } = useMyBar()

  const eventsState = useEventsState()
  const {
    isLoading: loadingEvents,
    isError: eventsError,
    error: eventsQueryError,
    refetch: refetchEvents
  } = useMyEvents()

  const {
    data: recommendationQualityStatus,
    isLoading: loadingRecommendationQuality,
    isError: recommendationQualityError,
    error: recommendationQualityQueryError,
    refetch: refetchRecommendationQuality
  } = useQuery({
    ...trpc.recommendations.getMyBarQualityStatus.queryOptions(),
    meta: { errorToast: false }
  })

  const {
    data: subscription,
    isLoading: loadingSub,
    isError: subError,
    error: subscriptionQueryError,
    isFetched: subFetched,
    refetch: refetchSub
  } = useMySubscription()

  const {
    data: analyticsEntitlements,
    isLoading: loadingEntitlements,
    isError: entitlementsError,
    error: entitlementsQueryError,
    refetch: refetchEntitlements
  } = useMyAnalyticsEntitlements()

  const [analyticsPreset, setAnalyticsPreset] =
    useState<AnalyticsPeriodPreset>('30d')
  const [customAnalyticsDates, setCustomAnalyticsDates] =
    useState<AnalyticsDateRange>(analyticsRange)
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

    onAnalyticsRangeChange(getAnalyticsRange(preset))
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

    onAnalyticsRangeChange(customAnalyticsDates)
    setAnalyticsPreset('custom')
  }

  const {
    data: creationPolicy,
    isError: policyError,
    error: policyQueryError,
    refetch: refetchPolicy
  } = useMyEventCreationPolicy()

  const {
    data: analyticsOverview,
    isLoading: loadingAnalytics,
    isError: analyticsError,
    error: analyticsOverviewError,
    isFetching: fetchingAnalytics,
    refetch: refetchAnalytics
  } = useQuery({
    ...trpc.commercialAnalytics.getMyAnalyticsOverview.queryOptions({
      from: analyticsRange.from,
      to: analyticsRange.to
    }),
    meta: { errorToast: false }
  })

  // A query do desempenho por jogo é da aba Grade; o seletor de período só
  // precisa saber se ela está buscando.
  const fetchingEventAnalytics =
    useIsFetching(trpc.commercialAnalytics.getMyEventAnalytics.pathFilter()) > 0

  const analyticsOverviewState: AnalyticsOverviewState = loadingAnalytics
    ? { status: 'loading' }
    : analyticsError
      ? {
          status: 'error',
          message: getUserFacingMessage(
            analyticsOverviewError,
            'Não foi possível carregar as métricas. Tente novamente.'
          ),
          retryable: isRetryableError(analyticsOverviewError),
          retry: () => {
            void refetchAnalytics()
          }
        }
      : analyticsOverview
        ? { status: 'ready', data: analyticsOverview }
        : { status: 'empty' }

  const eventList = eventsState.status === 'ready' ? eventsState.events : []
  const hasLiveEvent = eventList.some(
    (item) => getEventTemporalState(item.startsAt, item.endsAt, now) === 'live'
  )
  const isInactive = bar ? !bar.isActive : false

  const planKnown = subFetched && !loadingSub && !subError
  const plan = planKnown ? (subscription?.plan ?? 'starter') : null
  const planLabel = plan ? (PLAN_LABEL[plan] ?? plan) : null
  const isStarter = plan === 'starter'
  const lapsed = planKnown ? getLapsedPlan(subscription) : null
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

  return (
    <AdminTabPanel id="admin-visao" active={active} className="space-y-4">
      <div>
        <h2 className="onside-display text-2xl">Visão geral</h2>
        <p className="mt-1 text-sm text-[var(--onside-muted)]">
          Acompanhe a visibilidade, o plano e a programação do seu bar.
        </p>
      </div>

      {subError && (
        <QueryError
          message={getUserFacingMessage(
            subscriptionQueryError,
            'Não foi possível carregar a assinatura.'
          )}
          retryable={isRetryableError(subscriptionQueryError)}
          onRetry={() => {
            void refetchSub()
          }}
        />
      )}

      {eventsError && (
        <QueryError
          message={getUserFacingMessage(
            eventsQueryError,
            'Não foi possível carregar os eventos.'
          )}
          retryable={isRetryableError(eventsQueryError)}
          onRetry={() => {
            void refetchEvents()
          }}
        />
      )}

      {policyError && (
        <QueryError
          message={getUserFacingMessage(
            policyQueryError,
            'Não foi possível verificar a disponibilidade de eventos.'
          )}
          retryable={isRetryableError(policyQueryError)}
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
            search={{ origin: 'admin' }}
            className="onside-btn onside-btn-ink shrink-0 min-h-11 px-4 text-xs"
          >
            Ver planos
            <ArrowRight size={13} color="currentColor" aria-hidden="true" />
          </Link>
        </div>
      )}

      <RecommendationQualityStatus
        status={recommendationQualityStatus}
        loading={loadingRecommendationQuality}
        error={recommendationQualityError}
        retryable={isRetryableError(recommendationQualityQueryError)}
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
              <ArrowRight size={13} color="currentColor" aria-hidden="true" />
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
              eventList.length
            )}
          </div>
          <div className="onside-stat-label">Jogos na grade</div>
        </div>
        <div className="onside-stat">
          <div className="onside-stat-value tabular-nums">
            {loadingEvents ? (
              <Skeleton className="h-10 w-14" />
            ) : hasLiveEvent ? (
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
              : lapsed
                ? LAPSED_LABEL[lapsed.reason]
                : 'Plano atual'}
          </div>
        </div>
      </div>

      <AnalyticsPeriodSelector
        entitlements={analyticsEntitlements}
        loadingEntitlements={loadingEntitlements}
        entitlementsError={entitlementsError}
        retryableEntitlements={isRetryableError(entitlementsQueryError)}
        onRetryEntitlements={() => {
          void refetchEntitlements()
        }}
        range={analyticsRange}
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
        onCreateEvent={onCreateEvent}
      />
    </AdminTabPanel>
  )
}
