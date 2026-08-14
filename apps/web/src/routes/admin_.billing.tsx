import { Skeleton } from '@findsports_oficial/ui/components/skeleton'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import ArrowRight from 'reicon-react/icons/ArrowRight'
import ExternalLink from 'reicon-react/icons/ArrowUpRight'
import Check from 'reicon-react/icons/Check'
import CircleInfo from 'reicon-react/icons/CircleInfo'
import CreditCard from 'reicon-react/icons/CreditCard'
import Fire from 'reicon-react/icons/Fire'
import Loader from 'reicon-react/icons/Loader'
import Star from 'reicon-react/icons/Star'
import Trophy from 'reicon-react/icons/Trophy'
import { AppShell } from '@/components/app/app-shell'
import { analytics } from '@/lib/analytics'
import {
  getCustomerPortalUrl,
  listCustomerPayments
} from '@/lib/dodo-customer-client'
import { useTRPC } from '@/utils/trpc'

export const Route = createFileRoute('/admin_/billing')({
  head: () => ({
    meta: [
      { title: 'Assinatura e pagamentos — Onside' },
      { name: 'robots', content: 'noindex' }
    ]
  }),
  component: BillingPage
})

const PLAN_INFO = {
  starter: {
    name: 'Starter',
    price: 'R$ 119',
    icon: Fire,
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
    icon: Star,
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
    icon: Trophy,
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

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  active: {
    label: 'Ativo',
    className: 'onside-badge onside-badge-acid'
  },
  trialing: {
    label: 'Trial gratuito',
    className: 'onside-badge onside-badge-ink'
  },
  past_due: {
    label: 'Pagamento pendente',
    className:
      'onside-badge border-[var(--onside-live)] bg-[color-mix(in_srgb,var(--onside-live)_12%,var(--onside-paper))] text-[var(--onside-live-text)]'
  },
  inactive: {
    label: 'Inativo',
    className:
      'onside-badge border-[var(--onside-live)] text-[var(--onside-live-text)]'
  },
  cancelled: {
    label: 'Cancelado',
    className: 'onside-badge onside-badge-stone'
  }
}

function BillingPage() {
  const trpc = useTRPC()
  const [openingPortal, setOpeningPortal] = useState(false)
  const [portalError, setPortalError] = useState<string | null>(null)

  useEffect(() => {
    analytics.billingPageViewed()
  }, [])

  const subscriptionQuery = useQuery(trpc.pub.getMySubscription.queryOptions())
  const subscription = subscriptionQuery.data
  const loadingSub = subscriptionQuery.isLoading

  const paymentsQuery = useQuery({
    queryKey: ['dodo-payments'],
    queryFn: listCustomerPayments
  })

  const handleOpenPortal = async () => {
    analytics.portalOpened()
    setOpeningPortal(true)
    setPortalError(null)
    try {
      const portalUrl = await getCustomerPortalUrl()
      if (portalUrl) {
        window.location.href = portalUrl
        return
      }
      setPortalError('Não foi possível abrir o portal. Tente novamente.')
    } catch {
      setPortalError('Não foi possível abrir o portal. Tente novamente.')
    } finally {
      setOpeningPortal(false)
    }
  }

  const plan = subscription?.plan
  const planInfo = plan ? PLAN_INFO[plan] : null
  const PlanIcon = planInfo?.icon
  const statusInfo = STATUS_LABEL[subscription?.status ?? '']

  return (
    <AppShell variant="pub" userMeta="Assinatura">
      <div className="mb-8">
        <p className="onside-kicker mb-2 inline-flex items-center gap-2">
          <CreditCard size={12} color="currentColor" aria-hidden="true" />
          Assinatura e pagamentos
        </p>
        <h1 className="onside-display text-3xl md:text-4xl">
          Assinatura e pagamentos
        </h1>
        <p className="mt-2 text-sm text-[var(--onside-muted)]">
          Gerencie seu plano, veja o histórico e atualize seus dados de
          pagamento.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <section className="onside-panel p-6">
            <h2 className="onside-display mb-4 text-2xl">Plano atual</h2>

            {loadingSub ? (
              <div className="space-y-3" aria-busy="true" aria-live="polite">
                <span className="sr-only">Carregando assinatura…</span>
                <Skeleton className="h-24 rounded-none" />
                <Skeleton className="h-10 w-48 rounded-none" />
              </div>
            ) : subscriptionQuery.isError ? (
              <div
                className="onside-callout onside-callout-danger"
                role="alert"
              >
                <p className="text-sm">
                  Não foi possível carregar a assinatura.
                </p>
                <button
                  type="button"
                  onClick={() => subscriptionQuery.refetch()}
                  className="onside-btn onside-btn-outline min-h-11"
                >
                  Tentar novamente
                </button>
              </div>
            ) : planInfo && PlanIcon ? (
              <div className="onside-panel-stone mb-4 p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="grid size-10 place-items-center border border-[var(--onside-ink)] bg-[var(--onside-paper)]">
                      <PlanIcon
                        size={20}
                        color="currentColor"
                        aria-hidden="true"
                      />
                    </div>
                    <div>
                      <div className="onside-display text-xl">
                        {planInfo.name}
                      </div>
                      <div className="text-sm text-[var(--onside-muted)]">
                        {planInfo.price}/mês
                      </div>
                    </div>
                  </div>
                  {statusInfo ? (
                    <span className={statusInfo.className}>
                      {statusInfo.label}
                    </span>
                  ) : (
                    <span className="onside-badge onside-badge-stone">
                      Status desconhecido
                    </span>
                  )}
                </div>

                <ul className="mt-4 space-y-2">
                  {planInfo.features.map((f) => (
                    <li
                      key={f}
                      className="flex items-center gap-2 text-sm text-[var(--onside-ink)]"
                    >
                      <Check
                        size={14}
                        color="currentColor"
                        aria-hidden="true"
                      />
                      {f}
                    </li>
                  ))}
                </ul>

                {subscription?.currentPeriodEnd ? (
                  <p className="mt-4 text-xs text-[var(--onside-muted)]">
                    {subscription.status === 'trialing'
                      ? `Trial gratuito até ${formatDate(subscription.currentPeriodEnd)}`
                      : `Próxima cobrança em ${formatDate(subscription.currentPeriodEnd)}`}
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="mb-4 text-sm text-[var(--onside-muted)]">
                Nenhuma assinatura ativa encontrada.
              </p>
            )}

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleOpenPortal}
                disabled={openingPortal || loadingSub}
                className="onside-btn onside-btn-ink min-h-11"
              >
                {openingPortal ? (
                  <Loader
                    size={14}
                    color="currentColor"
                    className="animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <ExternalLink
                    size={14}
                    color="currentColor"
                    aria-hidden="true"
                  />
                )}
                {openingPortal ? 'Abrindo portal…' : 'Gerenciar assinatura'}
              </button>

              {plan && plan !== 'elite' ? (
                <Link
                  to="/plan"
                  onClick={() =>
                    analytics.upgradeClicked(
                      plan,
                      plan === 'starter' ? 'pro' : 'elite'
                    )
                  }
                  className="onside-btn onside-btn-acid min-h-11"
                >
                  <ArrowRight
                    size={14}
                    color="currentColor"
                    aria-hidden="true"
                  />
                  Fazer upgrade
                </Link>
              ) : null}
            </div>

            {portalError ? (
              <p
                className="mt-3 text-sm text-[var(--onside-live-text)]"
                role="alert"
              >
                {portalError}
              </p>
            ) : null}

            <div className="mt-4 flex items-start gap-2 text-xs text-[var(--onside-muted)]">
              <CircleInfo
                size={14}
                color="currentColor"
                className="mt-0.5 shrink-0"
                aria-hidden="true"
              />
              <span>
                Para cancelar, trocar de plano ou atualizar o método de
                pagamento, use o portal de gerenciamento acima.
              </span>
            </div>
          </section>

          <section className="onside-panel p-6">
            <h2 className="onside-display mb-4 text-2xl">
              Histórico de pagamentos
            </h2>

            {paymentsQuery.isLoading ? (
              <div className="space-y-3" aria-busy="true">
                <span className="sr-only">Carregando pagamentos…</span>
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-12 rounded-none" />
                ))}
              </div>
            ) : paymentsQuery.isError ? (
              <div
                className="onside-callout onside-callout-danger"
                role="alert"
              >
                <p className="text-sm">Erro ao carregar pagamentos.</p>
                <button
                  type="button"
                  onClick={() => paymentsQuery.refetch()}
                  className="onside-btn onside-btn-outline min-h-11"
                >
                  Tentar novamente
                </button>
              </div>
            ) : !paymentsQuery.data?.length ? (
              <p className="py-4 text-sm text-[var(--onside-muted)]">
                Nenhum pagamento registrado ainda.
              </p>
            ) : (
              <section
                className="overflow-x-auto"
                aria-label="Histórico de pagamentos"
              >
                <ul className="min-w-[280px] divide-y divide-[var(--onside-line)]">
                  {paymentsQuery.data.map((payment) => {
                    const paid = payment.status === 'succeeded'
                    const failed = payment.status === 'failed'
                    return (
                      <li
                        key={payment.paymentId}
                        className="flex items-center justify-between gap-4 py-3"
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-semibold">
                            {formatCurrency(payment.totalAmount)}
                          </div>
                          <div className="text-xs text-[var(--onside-muted)]">
                            {formatDate(payment.createdAt)}
                          </div>
                        </div>
                        <span
                          className={`onside-badge shrink-0 ${
                            paid
                              ? 'onside-badge-acid'
                              : failed
                                ? 'border-[var(--onside-live)] text-[var(--onside-live-text)]'
                                : 'onside-badge-stone'
                          }`}
                        >
                          {paid
                            ? 'Pago'
                            : failed
                              ? 'Falhou'
                              : String(payment.status)}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              </section>
            )}
          </section>
        </div>

        <aside className="space-y-4">
          <h3 className="onside-display text-2xl">Outros planos</h3>
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
                <div key={id} className="onside-panel p-5">
                  <div className="mb-3 flex items-center gap-3">
                    <div className="grid size-9 place-items-center border border-[var(--onside-ink)] bg-[var(--onside-stone)]">
                      <Icon size={16} color="currentColor" aria-hidden="true" />
                    </div>
                    <div>
                      <div className="text-sm font-bold">{info.name}</div>
                      <div className="text-xs text-[var(--onside-muted)]">
                        {info.price}/mês
                      </div>
                    </div>
                  </div>
                  <ul className="mb-4 space-y-1.5">
                    {info.features.map((f) => (
                      <li
                        key={f}
                        className="flex items-start gap-1.5 text-xs text-[var(--onside-ink)]"
                      >
                        <Check
                          size={12}
                          color="currentColor"
                          className="mt-0.5 shrink-0"
                          aria-hidden="true"
                        />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <Link
                    to="/plan"
                    className="onside-btn onside-btn-ink onside-btn-full min-h-11 text-xs"
                  >
                    Mudar para {info.name}
                    <ArrowRight
                      size={12}
                      color="currentColor"
                      aria-hidden="true"
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
