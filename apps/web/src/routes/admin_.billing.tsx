/** biome-ignore-all lint/a11y/useValidAriaRole: <explanation> */

import {
  ArrowRight01Icon,
  CreditCardIcon,
  Crown02Icon,
  InformationCircleIcon,
  LinkSquare01Icon,
  LoaderPinwheelIcon,
  SparklesIcon,
  Tick01Icon,
  ZapIcon
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { AppShell } from '@/components/app/app-shell'
import { useTRPC } from '@/utils/trpc'
import { authClient } from '../lib/auth-client'

export const Route = createFileRoute('/admin_/billing')({
  head: () => ({
    meta: [
      { title: 'Billing — FindSports' },
      { name: 'robots', content: 'noindex' }
    ]
  }),
  component: BillingPage
})

const PLAN_INFO = {
  starter: {
    name: 'Starter',
    price: 'R$ 119',
    icon: ZapIcon,
    color: 'text-zinc-600',
    bg: 'bg-zinc-100',
    features: [
      'Perfil público do bar',
      'Até 5 jogos por mês na agenda',
      'Aparece nas buscas básicas',
      'Suporte por e-mail'
    ]
  },
  pro: {
    name: 'Pro',
    price: 'R$ 189',
    icon: SparklesIcon,
    color: 'text-brand-blue',
    bg: 'bg-brand-blue/10',
    features: [
      'Tudo do Starter',
      'Jogos ilimitados na agenda',
      'Destaque na busca por time e liga',
      'Pin destacado no mapa',
      'Suporte prioritário'
    ]
  },
  elite: {
    name: 'Elite',
    price: 'R$ 389',
    icon: Crown02Icon,
    color: 'text-amber-600',
    bg: 'bg-amber-50',
    features: [
      'Tudo do Pro',
      'Topo da lista nos clássicos',
      'Banner patrocinado na home'
    ]
  }
} as const

function formatDate(date: string | Date | null): string {
  if (!date) return '—'
  return new Date(date).toLocaleDateString('pt-BR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  })
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(amount / 100)
}

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  active: { label: 'Ativo', color: 'text-emerald-600 bg-emerald-50' },
  trialing: { label: 'Trial gratuito', color: 'text-blue-600 bg-blue-50' },
  past_due: {
    label: 'Pagamento pendente',
    color: 'text-amber-600 bg-amber-50'
  },
  inactive: { label: 'Inativo', color: 'text-red-600 bg-red-50' },
  cancelled: { label: 'Cancelado', color: 'text-zinc-500 bg-zinc-100' }
}

function BillingPage() {
  const trpc = useTRPC()
  const [openingPortal, setOpeningPortal] = useState(false)

  const { data: subscription, isLoading: loadingSub } = useQuery(
    trpc.pub.getMySubscription.queryOptions()
  )

  const { data: paymentsData, isLoading: loadingPayments } = useQuery({
    queryKey: ['dodo-payments'],
    queryFn: async () => {
      const { data } = await (
        authClient.dodopayments.customer as any
      ).payments.list({
        query: { limit: 10, page: 1 }
      })
      return data
    }
  })

  const handleOpenPortal = async () => {
    setOpeningPortal(true)
    try {
      const { data } = await (authClient.dodopayments.customer as any).portal()
      if (data?.url) {
        window.location.href = data.url
      }
    } finally {
      setOpeningPortal(false)
    }
  }

  const plan = subscription?.plan ?? 'starter'
  const planInfo = PLAN_INFO[plan]
  const PlanIcon = planInfo.icon
  const statusInfo = STATUS_LABEL[subscription?.status ?? 'inactive']

  return (
    <AppShell role="pub">
      <div className="mb-8">
        <div className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.25em] text-brand-blue mb-2">
          <HugeiconsIcon
            icon={CreditCardIcon}
            size={12}
            color="currentColor"
            strokeWidth={1.5}
          />
          Billing
        </div>
        <h1 className="font-heading text-3xl md:text-4xl font-bold tracking-tight">
          Assinatura e pagamentos
        </h1>
        <p className="text-sm text-zinc-500 mt-1">
          Gerencie seu plano, veja o histórico e atualize seus dados de
          pagamento.
        </p>
      </div>

      <div className="grid md:grid-cols-[1fr_340px] gap-6">
        <div className="space-y-6">
          {/* Plano atual */}
          <section className="bg-white rounded-2xl ring-1 ring-black/5 p-6">
            <h2 className="font-heading text-lg font-bold mb-4">Plano atual</h2>

            {loadingSub ? (
              <div className="flex items-center gap-2 text-zinc-400">
                <HugeiconsIcon
                  icon={LoaderPinwheelIcon}
                  size={16}
                  color="currentColor"
                  strokeWidth={1.5}
                  className="animate-spin"
                />
                <span className="text-sm">Carregando...</span>
              </div>
            ) : (
              <div className={`rounded-2xl p-5 ${planInfo.bg} mb-4`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div
                      className={`size-10 rounded-xl bg-white grid place-items-center ${planInfo.color}`}
                    >
                      <HugeiconsIcon
                        icon={PlanIcon}
                        size={20}
                        color="currentColor"
                        strokeWidth={1.5}
                      />
                    </div>
                    <div>
                      <div className="font-heading text-xl font-bold">
                        {planInfo.name}
                      </div>
                      <div className="text-sm text-zinc-500">
                        {planInfo.price}/mês
                      </div>
                    </div>
                  </div>
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full ${statusInfo.color}`}
                  >
                    {statusInfo.label}
                  </span>
                </div>

                <ul className="mt-4 space-y-2">
                  {planInfo.features.map((f) => (
                    <li
                      key={f}
                      className="flex items-center gap-2 text-sm text-zinc-700"
                    >
                      <HugeiconsIcon
                        icon={Tick01Icon}
                        size={14}
                        color="currentColor"
                        strokeWidth={2}
                        className={planInfo.color}
                      />
                      {f}
                    </li>
                  ))}
                </ul>

                {subscription?.currentPeriodEnd && (
                  <p className="text-xs text-zinc-500 mt-4">
                    {subscription.status === 'trialing'
                      ? `Trial gratuito até ${formatDate(subscription.currentPeriodEnd)}`
                      : `Próxima cobrança em ${formatDate(subscription.currentPeriodEnd)}`}
                  </p>
                )}
              </div>
            )}

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleOpenPortal}
                disabled={openingPortal}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-black text-white text-xs font-bold hover:bg-brand-blue transition-colors disabled:opacity-50"
              >
                {openingPortal ? (
                  <HugeiconsIcon
                    icon={LoaderPinwheelIcon}
                    size={14}
                    color="currentColor"
                    strokeWidth={1.5}
                    className="animate-spin"
                  />
                ) : (
                  <HugeiconsIcon
                    icon={LinkSquare01Icon}
                    size={14}
                    color="currentColor"
                    strokeWidth={1.5}
                  />
                )}
                {openingPortal ? 'Abrindo portal...' : 'Gerenciar assinatura'}
              </button>

              {plan !== 'elite' && (
                <Link
                  to="/plan"
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-brand-blue text-white text-xs font-bold hover:bg-brand-blue/90 transition-colors"
                >
                  <HugeiconsIcon
                    icon={ArrowRight01Icon}
                    size={14}
                    color="currentColor"
                    strokeWidth={1.5}
                  />
                  Fazer upgrade
                </Link>
              )}
            </div>

            <div className="mt-4 flex items-start gap-2 text-xs text-zinc-400">
              <HugeiconsIcon
                icon={InformationCircleIcon}
                size={14}
                color="currentColor"
                strokeWidth={1.5}
                className="shrink-0 mt-0.5"
              />
              <span>
                Para cancelar, trocar de plano ou atualizar o método de
                pagamento, use o portal de gerenciamento acima.
              </span>
            </div>
          </section>

          {/* Histórico de pagamentos */}
          <section className="bg-white rounded-2xl ring-1 ring-black/5 p-6">
            <h2 className="font-heading text-lg font-bold mb-4">
              Histórico de pagamentos
            </h2>

            {loadingPayments ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="h-12 rounded-xl bg-zinc-100 animate-pulse"
                  />
                ))}
              </div>
            ) : !paymentsData?.items?.length ? (
              <p className="text-sm text-zinc-500 py-4">
                Nenhum pagamento registrado ainda.
              </p>
            ) : (
              <ul className="divide-y divide-zinc-100">
                {paymentsData.items.map((payment: any) => (
                  <li
                    key={payment.payment_id}
                    className="py-3 flex items-center justify-between gap-4"
                  >
                    <div>
                      <div className="text-sm font-semibold">
                        {formatCurrency(payment.total_amount)}
                      </div>
                      <div className="text-xs text-zinc-500">
                        {formatDate(payment.created_at)}
                      </div>
                    </div>
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full ${
                        payment.status === 'succeeded'
                          ? 'text-emerald-600 bg-emerald-50'
                          : payment.status === 'failed'
                            ? 'text-red-600 bg-red-50'
                            : 'text-zinc-500 bg-zinc-100'
                      }`}
                    >
                      {payment.status === 'succeeded'
                        ? 'Pago'
                        : payment.status === 'failed'
                          ? 'Falhou'
                          : payment.status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* Sidebar — outros planos */}
        <aside className="space-y-4">
          <h3 className="font-heading text-lg font-bold">Outros planos</h3>
          {(
            Object.entries(PLAN_INFO) as [
              string,
              (typeof PLAN_INFO)[keyof typeof PLAN_INFO]
            ][]
          )
            .filter(([id]) => id !== plan)
            .map(([id, info]) => {
              const Icon = info.icon
              return (
                <div
                  key={id}
                  className="bg-white rounded-2xl ring-1 ring-black/5 p-5"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div
                      className={`size-9 rounded-xl grid place-items-center ${info.bg} ${info.color}`}
                    >
                      <HugeiconsIcon
                        icon={Icon}
                        size={16}
                        color="currentColor"
                        strokeWidth={1.5}
                      />
                    </div>
                    <div>
                      <div className="font-bold text-sm">{info.name}</div>
                      <div className="text-xs text-zinc-500">
                        {info.price}/mês
                      </div>
                    </div>
                  </div>
                  <ul className="space-y-1.5 mb-4">
                    {info.features.map((f) => (
                      <li
                        key={f}
                        className="flex items-start gap-1.5 text-xs text-zinc-600"
                      >
                        <HugeiconsIcon
                          icon={Tick01Icon}
                          size={12}
                          color="currentColor"
                          strokeWidth={2}
                          className={`${info.color} mt-0.5 shrink-0`}
                        />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <Link
                    to="/plan"
                    className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-full bg-zinc-900 text-white text-xs font-bold hover:bg-brand-blue transition-colors"
                  >
                    Mudar para {info.name}
                    <HugeiconsIcon
                      icon={ArrowRight01Icon}
                      size={12}
                      color="currentColor"
                      strokeWidth={2}
                    />
                  </Link>
                </div>
              )
            })}
        </aside>
      </div>
    </AppShell>
  )
}
