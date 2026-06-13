import {
  ArrowLeftBigIcon,
  ArrowRightBigIcon,
  CrownIcon,
  InformationCircleIcon,
  SparklesIcon,
  ZapIcon
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { OnboardingHeader } from '@/components/onboarding/onboarding-header'
import { OnboardingLayout } from '@/components/onboarding/onboarding-layout'
import { type Plan, PlanCard } from '@/components/pricing/plan-card'
import { useTRPC } from '@/utils/trpc'
import { authClient } from '../lib/auth-client'

export const Route = createFileRoute('/plan')({
  head: () => ({
    meta: [
      { title: 'Escolha seu plano — FindSports' },
      {
        name: 'description',
        content: 'Escolha o plano ideal para o seu bar no FindSports.'
      },
      { name: 'robots', content: 'noindex' }
    ]
  }),
  component: PlanSelection
})

const PLANS: Plan[] = [
  {
    id: 'starter',
    name: 'Starter',
    tagline: 'Pra começar a aparecer',
    price: 'R$ 119',
    period: '/mês',
    icon: ZapIcon,
    features: [
      'Perfil público do bar',
      'Até 5 jogos por mês na agenda',
      'Aparece nas buscas básicas',
      'Suporte por e-mail'
    ]
  },
  {
    id: 'pro',
    name: 'Pro',
    tagline: 'Pra lotar nos clássicos',
    price: 'R$ 189',
    period: '/mês',
    icon: SparklesIcon,
    badge: 'Mais escolhido',
    highlight: true,
    features: [
      'Tudo do Starter',
      'Jogos ilimitados na agenda',
      'Destaque na busca por time e liga',
      'Pin destacado no mapa',
      'Suporte prioritário'
    ]
  },
  {
    id: 'elite',
    name: 'Elite',
    tagline: 'Pra ser referência na cidade',
    price: 'R$ 389',
    period: '/mês',
    icon: CrownIcon,
    features: [
      'Tudo do Pro',
      'Topo da lista nos clássicos',
      'Banner patrocinado na home'
    ]
  }
]

const PLAN_NAMES: Record<string, string> = {
  starter: 'Starter',
  pro: 'Pro',
  elite: 'Elite'
}

function PlanSelection() {
  const trpc = useTRPC()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { data: subscription } = useQuery(
    trpc.pub.getMySubscription.queryOptions()
  )

  const currentPlan = subscription?.plan ?? null
  const hasActivePlan =
    subscription?.status === 'active' || subscription?.status === 'trialing'

  const [selected, setSelected] = useState<Plan['id']>(() => {
    // Pré-seleciona o próximo plano acima do atual
    if (currentPlan === 'starter') return 'pro'
    if (currentPlan === 'pro') return 'elite'
    return 'pro'
  })

  const handleCheckout = async () => {
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
    currentPlan &&
    PLANS.findIndex((p) => p.id === selected) <
      PLANS.findIndex((p) => p.id === currentPlan)
  const isSamePlan = selected === currentPlan

  return (
    <OnboardingLayout variant="plan">
      <OnboardingHeader label="Conta de bar" accent="blue" mb="mb-12" />

      <div className="text-center mb-12 max-w-2xl mx-auto">
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-brand-blue mb-3">
          {hasActivePlan ? 'Alterar plano' : 'Último passo'}
        </p>
        <h1 className="font-heading text-4xl md:text-5xl font-bold leading-[1.05] tracking-tight mb-4">
          {hasActivePlan
            ? 'Escolha seu novo plano.'
            : 'Escolha o plano do seu bar.'}
        </h1>
        <p className="text-white/70 text-lg">
          {hasActivePlan
            ? 'A mudança entra em vigor no próximo ciclo de cobrança.'
            : 'Você pode trocar ou cancelar quando quiser. Comece com 45 dias grátis — sem cobranças até o fim do período.'}
        </p>
      </div>

      {/* Aviso de plano atual */}
      {hasActivePlan && currentPlan && (
        <div className="flex items-center gap-3 bg-white/10 ring-1 ring-white/20 rounded-2xl px-5 py-4 mb-8 max-w-2xl mx-auto">
          <HugeiconsIcon
            icon={InformationCircleIcon}
            size={20}
            color="currentColor"
            strokeWidth={1.5}
            className="text-brand-blue shrink-0"
          />
          <p className="text-sm text-white/80">
            Você está no plano{' '}
            <span className="font-bold text-white">
              {PLAN_NAMES[currentPlan]}
            </span>
            . Selecione outro plano abaixo para fazer a troca.
          </p>
        </div>
      )}

      <div className="grid md:grid-cols-3 gap-5 mb-10">
        {PLANS.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            isSelected={selected === plan.id}
            isCurrent={currentPlan === plan.id}
            onSelect={setSelected}
          />
        ))}
      </div>

      {/* Aviso de downgrade */}
      {isDowngrade && (
        <p className="text-center text-sm text-amber-400 mb-4">
          Atenção: você está selecionando um plano inferior ao atual.
        </p>
      )}

      {error && (
        <p className="text-center text-sm text-red-400 mb-4">{error}</p>
      )}

      <div className="flex items-center justify-between">
        <Link
          to={hasActivePlan ? '/admin/billing' : '/onboarding/pub'}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-semibold text-white/70 hover:text-white"
        >
          <HugeiconsIcon
            icon={ArrowLeftBigIcon}
            size={16}
            color="currentColor"
            strokeWidth={1.5}
          />
          Voltar
        </Link>

        <button
          type="button"
          onClick={handleCheckout}
          disabled={loading || isSamePlan}
          title={isSamePlan ? 'Este já é seu plano atual' : undefined}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-full font-bold text-sm bg-brand-blue text-white hover:bg-brand-blue/90 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          {loading
            ? 'Redirecionando...'
            : isSamePlan
              ? 'Plano atual'
              : `Continuar com ${PLANS.find((p) => p.id === selected)?.name}`}
          {!isSamePlan && (
            <HugeiconsIcon
              icon={ArrowRightBigIcon}
              size={16}
              color="currentColor"
              strokeWidth={1.5}
            />
          )}
        </button>
      </div>
    </OnboardingLayout>
  )
}
