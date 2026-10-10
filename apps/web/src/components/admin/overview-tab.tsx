import { Skeleton } from '@findsports_oficial/ui/components/skeleton'
import { useIsFetching, useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import AlertCircle from 'reicon-react/icons/AlertCircle'
import ArrowRight from 'reicon-react/icons/ArrowRight'
import CircleInfo from 'reicon-react/icons/CircleInfo'
import Plus from 'reicon-react/icons/Plus'
import { useMinuteNow } from '@/components/app/minute-tick'
import { getEventTemporalState } from '@/domain/events'
import { analytics } from '@/lib/analytics'
import { eventLimitReachedTitle } from '@/lib/event-limit'
import {
  getLapsedPaidPlan,
  getShownPlan,
  isStarterSubscription
} from '@/lib/lapsed-plan'
import {
  CONTRACTED_TRIAL_LABEL,
  getTrialNotice,
  isContractedTrial
} from '@/lib/plan-catalog'
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

const restantes = (n: number) => `${n} ${n === 1 ? 'restante' : 'restantes'}`

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

    onAnalyticsRangeChange(
      getAnalyticsRange(
        preset,
        new Date(),
        bar ? new Date(bar.createdAt) : undefined
      )
    )
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
  const shownPlan = planKnown ? getShownPlan(subscription) : null
  const trialNotice = planKnown ? getTrialNotice(subscription) : null
  // Sem assinatura o card ao lado diz "Sem plano": nada de aviso do Starter.
  const isStarter = planKnown && isStarterSubscription(subscription)
  const standing = planKnown ? subscription?.standing : null
  // Pro ou Elite parado vale o limite do Starter (WEB-129): mostra a mesma
  // contagem, e a saída é regularizar, não fazer upgrade (WEB-331).
  const lapsedPlan = planKnown ? getLapsedPaidPlan(subscription) : null
  const limitedPolicy =
    creationPolicy?.status === 'limited' ? creationPolicy : null
  const eventsUsed = limitedPolicy?.used ?? 0
  const eventsRemaining = limitedPolicy?.remaining ?? null
  const isNearLimit = isStarter && eventsRemaining === 1
  const isAtLimit = limitedPolicy ? !limitedPolicy.canCreate : false
  // No limite ou sem plano ativo: a grade trava o "Novo evento" (WEB-353).
  const cannotCreate = creationPolicy?.canCreate === false

  useEffect(() => {
    if (isAtLimit && !limitTracked.current) {
      analytics.eventLimitReached()
      limitTracked.current = true
    }
  }, [isAtLimit])

  return (
    <AdminTabPanel id="admin-visao" active={active} className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="onside-display text-2xl">Visão geral</h2>
          <p className="mt-1 text-sm text-[var(--onside-muted)]">
            Acompanhe a visibilidade, o plano e a programação do seu bar.
          </p>
        </div>
        {/* Leva à Minha grade, onde ficam o formulário e os avisos de limite
            do plano (WEB-303). Sem poder criar, deixa de ser a ação principal
            e só mostra a grade (WEB-353). */}
        <button
          type="button"
          onClick={onCreateEvent}
          className={`onside-btn ${cannotCreate ? 'onside-btn-outline' : 'onside-btn-acid'} min-h-11`}
        >
          {cannotCreate ? (
            'Ver grade'
          ) : (
            <>
              <Plus size={16} color="currentColor" aria-hidden="true" />
              Criar evento
            </>
          )}
        </button>
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

      {trialNotice && (
        <div className="onside-callout onside-callout-acid">
          <CircleInfo
            size={20}
            color="currentColor"
            className="mt-0.5 shrink-0"
            aria-hidden="true"
          />
          <p className="font-semibold text-sm">
            {isContractedTrial(subscription)
              ? `${CONTRACTED_TRIAL_LABEL} · ${trialNotice}`
              : trialNotice}
          </p>
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

      {(isStarter || lapsedPlan) && !isInactive && eventsRemaining !== null && (
        <div
          className={`onside-callout ${
            isAtLimit
              ? 'onside-callout-danger'
              : isNearLimit || lapsedPlan
                ? 'onside-callout-warn'
                : 'onside-callout-acid'
          }`}
        >
          {isAtLimit || isNearLimit || lapsedPlan ? (
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
                ? eventLimitReachedTitle(limitedPolicy?.periodEnd ?? null)
                : lapsedPlan
                  ? `${lapsedPlan.label} — ${eventsRemaining} de ${limitedPolicy?.limit ?? 0} jogos restantes`
                  : isNearLimit
                    ? 'Último jogo disponível no plano Starter'
                    : `Plano Starter — ${eventsRemaining} de ${limitedPolicy?.limit ?? 0} jogos restantes`}
            </p>
            <p className="text-sm opacity-90">
              {lapsedPlan
                ? `${lapsedPlan.cause} Os jogos ilimitados voltam assim que a assinatura for regularizada.`
                : isAtLimit
                  ? 'Faça upgrade para o plano Pro e cadastre jogos ilimitados.'
                  : isNearLimit
                    ? 'Considere fazer upgrade para o Pro antes de atingir o limite.'
                    : `Você usou ${eventsUsed} jogo${eventsUsed !== 1 ? 's' : ''} neste período de cobrança.`}
            </p>
          </div>
          {lapsedPlan ? (
            <Link
              to="/admin/billing"
              className="onside-btn onside-btn-ink shrink-0 min-h-11 px-4 text-xs"
            >
              Regularizar assinatura
              <ArrowRight size={13} color="currentColor" aria-hidden="true" />
            </Link>
          ) : (
            (isAtLimit || isNearLimit) && (
              <Link
                to="/plan"
                search={{ origin: 'admin' }}
                className="onside-btn onside-btn-ink shrink-0 min-h-11 px-4 text-xs"
              >
                Fazer upgrade
                <ArrowRight size={13} color="currentColor" aria-hidden="true" />
              </Link>
            )
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
              (shownPlan?.name ?? '—')
            )}
          </div>
          {/* Plano gravado + pé da assinatura (WEB-344): só o plano em dia é
              "Plano atual", e sem assinatura o Starter não é plano contratado. */}
          <div className="onside-stat-label">
            {shownPlan && !subscription ? (
              <Link
                to="/plan"
                search={{ origin: 'admin' }}
                className="underline"
              >
                {shownPlan.label}
              </Link>
            ) : (
              [
                shownPlan && standing !== 'current' ? shownPlan.label : null,
                (isStarter || lapsedPlan) && eventsRemaining !== null
                  ? restantes(eventsRemaining)
                  : null
              ]
                .filter(Boolean)
                .join(' · ') || 'Plano atual'
            )}
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
        showComparison={analyticsPreset !== 'all'}
        planNote={shownPlan?.note}
        noPlan={planKnown && !subscription}
        onCreateEvent={onCreateEvent}
      />
    </AdminTabPanel>
  )
}
