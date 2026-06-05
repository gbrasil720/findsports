import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Clock,
  Crown,
  Sparkles,
  Zap
} from 'lucide-react'
import { useState } from 'react'
import { Logo } from '@/components/landing/logo'

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

type Plan = {
  id: 'starter' | 'pro' | 'elite'
  name: string
  tagline: string
  price: string
  period: string
  icon: typeof Zap
  features: string[]
  highlight?: boolean
  badge?: string
}

const PLANS: Plan[] = [
  {
    id: 'starter',
    name: 'Starter',
    tagline: 'Pra começar a aparecer',
    price: 'R$ 89',
    period: '/mês',
    icon: Zap,
    features: [
      'Perfil público do bar',
      'Até 10 jogos por mês na agenda',
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
    icon: Sparkles,
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
    icon: Crown,
    features: [
      'Tudo do Pro',
      'Topo da lista nos clássicos',
      'Banner patrocinado na home',
      'Notificações push pros torcedores',
      'Gerente de conta dedicado'
    ]
  }
]

function PlanSelection() {
  const [selected, setSelected] = useState<Plan['id']>('pro')

  return (
    <div className="min-h-screen bg-zinc-950 text-white px-6 py-10 md:py-14 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(22,104,255,0.25),transparent_55%),radial-gradient(circle_at_80%_80%,rgba(255,90,31,0.18),transparent_55%)]" />

      <div className="relative z-10 max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-12">
          <Link to="/" className="inline-flex items-center gap-2.5">
            <Logo className="size-9" />
            <span className="font-heading text-xl font-bold tracking-tight">
              FindSports
            </span>
          </Link>
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.25em] text-white/70">
            <span className="size-2 rounded-full bg-brand-blue" />
            Conta de bar
          </div>
        </div>

        <div className="text-center mb-12 max-w-2xl mx-auto">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-brand-blue mb-3">
            Último passo
          </p>
          <h1 className="font-heading text-4xl md:text-5xl font-bold leading-[1.05] tracking-tight mb-4">
            Escolha o plano do seu bar.
          </h1>
          <p className="text-white/70 text-lg">
            Você pode trocar ou cancelar quando quiser. Comece com 45 dias
            grátis — sem cobranças até o fim do período.
          </p>
        </div>

        {/* Aviso de pagamento pendente */}
        <div className="flex items-center gap-3 bg-brand-blue/10 ring-1 ring-brand-blue/30 rounded-2xl px-5 py-4 mb-8 max-w-2xl mx-auto">
          <Clock className="size-5 text-brand-blue shrink-0" />
          <p className="text-sm text-white/80">
            O pagamento será habilitado em breve. Por enquanto, explore os
            planos e escolha o ideal para o seu bar.
          </p>
        </div>

        {/* Plans */}
        <div className="grid md:grid-cols-3 gap-5 mb-10">
          {PLANS.map((plan) => {
            const Icon = plan.icon
            const isSelected = selected === plan.id
            return (
              <button
                key={plan.id}
                type="button"
                onClick={() => setSelected(plan.id)}
                className={`relative text-left rounded-3xl p-7 transition-all backdrop-blur-md ring-1 ${
                  isSelected
                    ? 'bg-white/[0.08] ring-brand-blue scale-[1.02] shadow-[0_0_0_4px_rgba(22,104,255,0.15)]'
                    : 'bg-white/[0.03] ring-white/10 hover:bg-white/[0.06] hover:ring-white/20'
                } ${plan.highlight ? 'md:-translate-y-2' : ''}`}
              >
                {plan.badge && (
                  <span className="absolute -top-3 left-7 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-brand-orange text-white">
                    {plan.badge}
                  </span>
                )}

                <div className="flex items-center gap-3 mb-5">
                  <div
                    className={`size-11 rounded-2xl grid place-items-center ${
                      isSelected
                        ? 'bg-brand-blue text-white'
                        : 'bg-white/5 text-white/70'
                    }`}
                  >
                    <Icon className="size-5" />
                  </div>
                  <div>
                    <div className="font-heading text-xl font-bold leading-none">
                      {plan.name}
                    </div>
                    <div className="text-xs text-white/60 mt-1">
                      {plan.tagline}
                    </div>
                  </div>
                </div>

                <div className="mb-6 flex items-baseline gap-1">
                  <span className="font-heading text-4xl font-bold">
                    {plan.price}
                  </span>
                  <span className="text-sm text-white/50">{plan.period}</span>
                </div>

                <ul className="space-y-2.5">
                  {plan.features.map((f) => (
                    <li
                      key={f}
                      className="flex items-start gap-2.5 text-sm text-white/80"
                    >
                      <Check
                        className={`size-4 mt-0.5 shrink-0 ${
                          isSelected ? 'text-brand-blue' : 'text-white/40'
                        }`}
                      />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                <div
                  className={`mt-6 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider ${
                    isSelected ? 'text-brand-blue' : 'text-white/40'
                  }`}
                >
                  {isSelected ? (
                    <>
                      <Check className="size-3.5" /> Selecionado
                    </>
                  ) : (
                    'Selecionar'
                  )}
                </div>
              </button>
            )
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between">
          <Link
            to="/onboarding/pub"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-semibold text-white/70 hover:text-white"
          >
            <ArrowLeft className="size-4" /> Voltar
          </Link>

          <button
            type="button"
            disabled
            title="Pagamento em breve"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-full font-bold text-sm bg-brand-blue/40 text-white/40 cursor-not-allowed"
          >
            {`Continuar com ${PLANS.find((p) => p.id === selected)?.name}`}
            <ArrowRight className="size-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
