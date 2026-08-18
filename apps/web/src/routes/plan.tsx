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
import { PLAN_CATALOG, PLAN_TIER_ORDER, type Plan } from '@/lib/plan-catalog'
import { useTRPC } from '@/utils/trpc'
import { authClient } from '../lib/auth-client'

export const Route = createFileRoute('/plan')({
  head: () => ({
    meta: [
      { title: 'Escolha seu plano — Onside' },
      {
        name: 'description',
        content: 'Escolha o plano ideal para o seu bar no Onside.'
      },
      { name: 'robots', content: 'noindex' }
    ]
  }),
  component: PlanSelection
})

function PlanSelection() {
  const trpc = useTRPC()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const userTouched = useRef(false)

  const subscriptionQuery = useQuery(trpc.pub.getMySubscription.queryOptions())
  const subscription = subscriptionQuery.data
  const currentPlan = subscription?.plan ?? null
  const hasActivePlan =
    subscription?.status === 'active' || subscription?.status === 'trialing'

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
    analytics.checkoutStarted(selected)
    setLoading(true)
    setError(null)

    try {
      const { data, error: checkoutError } =
        await authClient.dodopayments.checkoutSession({
          slug: selected
        })

      if (checkoutError || !data?.url) {
        setError('Erro ao iniciar pagamento. Tente novamente.')
        return
      }

      window.location.href = data.url
    } catch {
      setError('Erro ao iniciar pagamento. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  const isDowngrade =
    currentPlan && PLAN_TIER_ORDER[selected] < PLAN_TIER_ORDER[currentPlan]
  const isSamePlan = selected === currentPlan

  return (
    <OnboardingLayout variant="plan">
      <OnboardingHeader label="Conta de bar" mb="mb-10" />

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

      {subscriptionQuery.isLoading ? (
        <div
          className="mb-8 flex items-center justify-center gap-2 text-[var(--onside-paper)]"
          aria-live="polite"
        >
          <Loader
            size={18}
            color="currentColor"
            className="animate-spin"
            aria-hidden="true"
          />
          <span className="text-sm">Carregando assinatura…</span>
        </div>
      ) : null}

      {subscriptionQuery.isError ? (
        <div className="onside-callout onside-callout-danger mx-auto mb-8 max-w-2xl">
          <p className="text-sm">Não foi possível carregar sua assinatura.</p>
          <button
            type="button"
            onClick={() => subscriptionQuery.refetch()}
            className="onside-btn onside-btn-outline min-h-11"
          >
            Tentar novamente
          </button>
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

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          to={hasActivePlan ? '/admin/billing' : '/onboarding/pub'}
          className="onside-btn onside-btn-outline min-h-11 text-[var(--onside-paper)] border-[var(--onside-paper)]"
        >
          <ArrowLeft size={16} color="currentColor" aria-hidden="true" />
          Voltar
        </Link>

        <button
          type="button"
          onClick={handleCheckout}
          disabled={loading || isSamePlan || subscriptionQuery.isLoading}
          title={isSamePlan ? 'Este já é seu plano atual' : undefined}
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
