import { Skeleton } from '@findsports_oficial/ui/components/skeleton'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import ArrowLeft from 'reicon-react/icons/ArrowLeft'
import ArrowRight from 'reicon-react/icons/ArrowRight'
import CircleInfo from 'reicon-react/icons/CircleInfo'
import Loader from 'reicon-react/icons/Loader'
import { OnboardingHeader } from '@/components/onboarding/onboarding-header'
import { OnboardingLayout } from '@/components/onboarding/onboarding-layout'
import { PlanCard } from '@/components/pricing/plan-card'
import { analytics } from '@/lib/analytics'
import {
  getPlanExitLink,
  getPlanSelectionState,
  PLAN_CATALOG,
  type Plan,
  parsePlanOrigin
} from '@/lib/plan-catalog'
import { PWA_LINKS, PWA_META } from '@/lib/pwa'
import { roleAccountLabel } from '@/lib/roles'
import { markCheckoutIntent } from '@/lib/subscription-receipt'
import { getUserFacingError } from '@/lib/user-facing-error'
import { useTRPC } from '@/utils/trpc'
import { authClient } from '../lib/auth-client'

export const Route = createFileRoute('/plan')({
  validateSearch: (search: Record<string, unknown>) => {
    const origin = parsePlanOrigin(search.origin)
    return origin ? { origin } : {}
  },
  head: () => ({
    meta: [
      { title: 'Escolha seu plano — Onside' },
      {
        name: 'description',
        content: 'Escolha o plano ideal para o seu bar no Onside.'
      },
      { name: 'robots', content: 'noindex' },
      ...PWA_META
    ],
    links: [...PWA_LINKS]
  }),
  component: PlanSelection
})

function PlanSelection() {
  const { origin } = Route.useSearch()
  const trpc = useTRPC()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const userTouched = useRef(false)

  const subscriptionQuery = useQuery({
    ...trpc.pub.getMySubscription.queryOptions(),
    meta: { errorToast: false }
  })
  // ESC-19: a contratação pode estar fechada. Quem decide é o servidor — ver
  // `api/auth/$` — mas descobrir isso só depois do clique, num erro genérico,
  // seria trabalhar contra o dono do bar. Aqui a tela avisa antes.
  //
  // O padrão enquanto carrega é LIBERADO, e isso é deliberado: se a leitura
  // da configuração falhar, esconder o botão trancaria a contratação mesmo
  // com ela aberta. Liberar na dúvida no máximo devolve o 503 do servidor,
  // que a tela já mostra.
  const configQuery = useQuery(trpc.appConfig.getPublic.queryOptions())
  const checkoutLiberado =
    configQuery.data?.['billing.checkout_enabled'] ?? true
  const subscription = subscriptionQuery.data
  const currentPlan = subscription?.currentPlan ?? null
  const hasActivePlan = currentPlan !== null
  const exitLink = getPlanExitLink(origin)
  const subscriptionErrorFeedback = subscriptionQuery.error
    ? getUserFacingError(
        subscriptionQuery.error,
        'Não foi possível carregar sua assinatura. Tente novamente.'
      )
    : null

  const [selected, setSelected] = useState<Plan['id']>('pro')

  // Sync selection when subscription arrives, without overwriting user choice
  useEffect(() => {
    if (userTouched.current) return
    if (!currentPlan) return
    if (currentPlan === 'starter') setSelected('pro')
    else if (currentPlan === 'pro') setSelected('elite')
    else setSelected('pro')
  }, [currentPlan])

  const handleSelectPlan = (planId: Plan['id']) => {
    userTouched.current = true
    setSelected(planId)
  }

  const handleCheckout = async () => {
    if (!checkoutLiberado) {
      setError(
        'A contratação de planos está temporariamente indisponível. Tente novamente em instantes.'
      )
      return
    }

    analytics.checkoutStarted(selected)
    // WEB-59: marca nossa, não do provedor. É o que permite a `/plan/confirmed`
    // distinguir quem está voltando do checkout — e merece esperar o webhook —
    // de quem abriu a URL do recibo sem ter assinatura.
    markCheckoutIntent(selected)
    setLoading(true)
    setError(null)

    try {
      const { data, error: checkoutError } =
        await authClient.dodopayments.checkoutSession({
          slug: selected
        })

      if (checkoutError || !data?.url) {
        setError('Não foi possível iniciar o pagamento. Tente novamente.')
        return
      }

      window.location.href = data.url
    } catch {
      setError('Não foi possível iniciar o pagamento. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  const { isDowngrade, isSamePlan } = getPlanSelectionState(
    currentPlan,
    selected
  )

  return (
    <OnboardingLayout variant="plan">
      <OnboardingHeader label={roleAccountLabel('pub')} mb="mb-10" />

      {subscriptionQuery.isLoading ? (
        <div
          className="mx-auto mb-10 max-w-2xl text-center"
          role="status"
          aria-busy="true"
          aria-live="polite"
        >
          <span className="sr-only">Carregando assinatura…</span>
          <Skeleton className="mx-auto mb-3 h-3 w-24" />
          <Skeleton className="mx-auto mb-4 h-12 w-80 max-w-full" />
          <Skeleton className="mx-auto h-6 w-full max-w-xl" />
        </div>
      ) : (
        <div className="mx-auto mb-10 max-w-2xl text-center">
          <p className="onside-kicker onside-kicker-acid mb-3">
            {hasActivePlan ? 'Alterar plano' : 'Último passo'}
          </p>
          <h1 className="onside-display mb-4 text-4xl text-[var(--onside-paper)] md:text-5xl">
            {hasActivePlan
              ? 'Escolha seu novo plano.'
              : 'Escolha o plano do seu bar.'}
          </h1>
          <p className="onside-text-muted-on-ink text-lg">
            {hasActivePlan
              ? 'A mudança entra em vigor no próximo ciclo de cobrança.'
              : 'Você pode trocar ou cancelar quando quiser. Comece com 45 dias grátis — sem cobranças até o fim do período.'}
          </p>
        </div>
      )}

      {subscriptionQuery.isError ? (
        <div
          className="onside-callout onside-callout-danger mx-auto mb-8 max-w-2xl"
          role="alert"
        >
          <p className="text-sm">{subscriptionErrorFeedback?.message}</p>
          {subscriptionErrorFeedback?.retryable ? (
            <button
              type="button"
              onClick={() => subscriptionQuery.refetch()}
              className="onside-btn onside-btn-outline min-h-11"
            >
              Tentar novamente
            </button>
          ) : null}
        </div>
      ) : null}

      {hasActivePlan && currentPlan ? (
        <div className="onside-callout onside-callout-stone mx-auto mb-8 max-w-2xl">
          <CircleInfo
            size={20}
            color="currentColor"
            className="shrink-0"
            aria-hidden="true"
          />
          <p className="text-sm">
            Você está no plano{' '}
            <span className="font-bold">
              {PLAN_CATALOG.find((p) => p.id === currentPlan)?.name}
            </span>
            . Selecione outro plano abaixo para fazer a troca.
          </p>
        </div>
      ) : null}

      <fieldset className="mb-10 grid gap-5 border-0 p-0 md:grid-cols-3">
        <legend className="sr-only">Planos disponíveis</legend>
        {PLAN_CATALOG.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            isSelected={selected === plan.id}
            isCurrent={currentPlan === plan.id}
            onSelect={handleSelectPlan}
          />
        ))}
      </fieldset>

      {!checkoutLiberado && !configQuery.isLoading ? (
        <div
          className="onside-callout onside-callout-warn mx-auto mb-4 max-w-2xl"
          role="status"
        >
          <p className="text-sm font-semibold">
            A contratação de planos está temporariamente indisponível.
          </p>
          <p className="text-sm">
            Estamos liberando os pagamentos aos poucos. Sua conta continua ativa
            e você não perde nada esperando.
          </p>
        </div>
      ) : null}

      {isDowngrade ? (
        <div
          className="onside-callout onside-callout-warn mx-auto mb-4 max-w-2xl"
          role="status"
        >
          <p className="text-sm font-semibold">
            Atenção: você está selecionando um plano inferior ao atual.
          </p>
        </div>
      ) : null}

      {error ? (
        <p
          className="mb-4 text-center text-sm text-[var(--onside-live-text)]"
          role="alert"
          aria-live="assertive"
        >
          {error}
        </p>
      ) : null}

      <div
        className="flex flex-wrap items-center justify-between gap-3"
        aria-busy={configQuery.isLoading || undefined}
      >
        {configQuery.isLoading ? (
          <span className="sr-only">
            Verificando disponibilidade da contratação…
          </span>
        ) : null}
        <Link
          to={exitLink.to}
          className="onside-btn onside-btn-outline min-h-11 text-[var(--onside-paper)] border-[var(--onside-paper)]"
        >
          <ArrowLeft size={16} color="currentColor" aria-hidden="true" />
          {exitLink.label}
        </Link>

        <button
          type="button"
          onClick={handleCheckout}
          disabled={
            loading ||
            isSamePlan ||
            subscriptionQuery.isLoading ||
            !checkoutLiberado
          }
          title={
            !checkoutLiberado
              ? 'Contratação temporariamente indisponível'
              : isSamePlan
                ? 'Este já é seu plano atual'
                : undefined
          }
          className="onside-btn onside-btn-acid min-h-11"
        >
          {loading ? (
            <Loader
              size={16}
              color="currentColor"
              className="animate-spin"
              aria-hidden="true"
            />
          ) : null}
          {loading
            ? 'Redirecionando…'
            : isSamePlan
              ? 'Plano atual'
              : `Continuar com ${PLAN_CATALOG.find((p) => p.id === selected)?.name}`}
          {!isSamePlan && !loading ? (
            <ArrowRight size={16} color="currentColor" aria-hidden="true" />
          ) : null}
        </button>
      </div>
    </OnboardingLayout>
  )
}
