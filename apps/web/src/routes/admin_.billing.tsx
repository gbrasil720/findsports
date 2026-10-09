import { Skeleton } from '@findsports_oficial/ui/components/skeleton'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import ArrowRight from 'reicon-react/icons/ArrowRight'
import ExternalLink from 'reicon-react/icons/ArrowUpRight'
import Check from 'reicon-react/icons/Check'
import CircleInfo from 'reicon-react/icons/CircleInfo'
import CreditCard from 'reicon-react/icons/CreditCard'
import Loader from 'reicon-react/icons/Loader'
import { AppShell } from '@/components/app/app-shell'
import { analytics } from '@/lib/analytics'
import { openBillingPortal } from '@/lib/billing-client'
import { isLapsed, LAPSED_COPY } from '@/lib/lapsed-plan'
import {
  FOUNDER_DISCOUNT_NOTE,
  formatPlanPrice,
  formatPlanPricing,
  getPlan,
  getPlanPageMode,
  getTrialNotice,
  PLAN_CATALOG,
  TRIAL_NO_CARD_NOTE
} from '@/lib/plan-catalog'
import { PWA_LINKS, PWA_META } from '@/lib/pwa'
import { getUserFacingError } from '@/lib/user-facing-error'
import { useTRPC } from '@/utils/trpc'

export const Route = createFileRoute('/admin_/billing')({
  head: () => ({
    meta: [
      { title: 'Assinatura e pagamentos — Onside' },
      { name: 'robots', content: 'noindex' },
      ...PWA_META
    ],
    links: [...PWA_LINKS]
  }),
  component: BillingPage
})

function formatDate(date: string | Date | null): string {
  if (!date) return '—'
  return new Date(date).toLocaleDateString('pt-BR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  })
}

const PENDING_BADGE =
  'onside-badge border-[var(--onside-live)] bg-[color-mix(in_srgb,var(--onside-live)_12%,var(--onside-paper))] text-[var(--onside-live-text)]'

/** Por `status`, mais `trial_ended`, que o servidor distingue de `trialing`. */
const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  active: {
    label: 'Ativo',
    className: 'onside-badge onside-badge-acid'
  },
  trialing: {
    label: 'Trial gratuito',
    className: 'onside-badge onside-badge-ink'
  },
  past_due: { label: LAPSED_COPY.past_due.label, className: PENDING_BADGE },
  trial_ended: {
    label: LAPSED_COPY.trial_ended.label,
    className: PENDING_BADGE
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
  const session = Route.useRouteContext({ select: (ctx) => ctx.session })
  const [openingPortal, setOpeningPortal] = useState(false)
  const [portalError, setPortalError] = useState<string | null>(null)

  // A seção desenha o próprio erro, com botão de tentar de novo; o toast
  // global repetiria a mesma falha.
  const subscriptionQuery = useQuery({
    ...trpc.pub.getMySubscription.queryOptions(),
    meta: { errorToast: false }
  })
  const subscription = subscriptionQuery.data
  const loadingSub = subscriptionQuery.isLoading

  // Sem cliente no Stripe não há portal a abrir — é o bar no teste grátis do
  // cadastro, que nunca passou pelo checkout (WEB-264). O id da assinatura
  // cobre a sessão em cache de quem acabou de pagar.
  const hasProviderCustomer = Boolean(
    session?.user.stripeCustomerId || subscription?.externalSubscriptionId
  )
  const subscriptionErrorFeedback = subscriptionQuery.error
    ? getUserFacingError(
        subscriptionQuery.error,
        'Não foi possível carregar a assinatura. Tente novamente.'
      )
    : null
  const handleOpenPortal = async () => {
    setOpeningPortal(true)
    setPortalError(null)
    try {
      // Com URL na resposta o cliente do better-auth já está navegando para
      // o portal; ver `openBillingPortal`.
      if (await openBillingPortal()) return
      setPortalError('Não foi possível abrir o portal. Tente novamente.')
    } catch {
      setPortalError('Não foi possível abrir o portal. Tente novamente.')
    } finally {
      setOpeningPortal(false)
    }
  }

  const plan = subscription?.currentPlan
  // Plano parado continua sendo o plano do bar: é aqui que o dono regulariza
  // (WEB-141). Sem isso a página dizia "nenhuma assinatura" para quem deve.
  const standing = subscription?.standing
  const lapsed = isLapsed(standing) ? standing : null
  // Trial vencido sem assinatura no provedor não tem o que regularizar no
  // portal: esse bar ainda não contratou, e o caminho é `/plan` (WEB-249).
  const mode = getPlanPageMode(subscription)
  const contractInPlan = lapsed !== null && mode === 'checkout'
  // Teste grátis do cadastro: ainda não há o que gerenciar no Stripe, e o
  // caminho para contratar antes do fim é `/plan` (WEB-31).
  const onLocalTrial = mode === 'trial'
  const shownPlan = plan ?? (lapsed ? subscription?.plan : null)
  const planInfo = shownPlan ? getPlan(shownPlan) : null
  const statusInfo =
    STATUS_LABEL[
      standing === 'trial_ended' ? standing : (subscription?.status ?? '')
    ]

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
              <div aria-busy="true" aria-live="polite">
                <span className="sr-only">Carregando assinatura…</span>
                <div
                  className="onside-panel-stone mb-4 space-y-4 p-5"
                  aria-hidden="true"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <Skeleton className="size-10" />
                      <div className="space-y-2">
                        <Skeleton className="h-6 w-32" />
                        <Skeleton className="h-4 w-24" />
                      </div>
                    </div>
                    <Skeleton className="h-6 w-24" />
                  </div>
                  <ul className="space-y-2">
                    {[1, 2, 3, 4].map((item) => (
                      <li key={item} className="flex items-center gap-2">
                        <Skeleton className="size-4" />
                        <Skeleton className="h-4 w-48 max-w-full" />
                      </li>
                    ))}
                  </ul>
                  <Skeleton className="h-3 w-48" />
                </div>
              </div>
            ) : subscriptionQuery.isError ? (
              <div
                className="onside-callout onside-callout-danger"
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
            ) : planInfo ? (
              <div className="onside-panel-stone mb-4 p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="grid size-10 place-items-center border border-[var(--onside-ink)] bg-[var(--onside-paper)]">
                      {planInfo.icon ? (
                        <planInfo.icon
                          size={20}
                          color="currentColor"
                          aria-hidden="true"
                        />
                      ) : null}
                    </div>
                    <div>
                      <div className="onside-display text-xl">
                        {planInfo.name}
                      </div>
                      <div className="text-sm text-[var(--onside-muted)]">
                        {formatPlanPrice(planInfo.tablePrice)}
                        {planInfo.period}
                      </div>
                      <div className="mt-0.5 text-xs text-[var(--onside-muted)]">
                        {FOUNDER_DISCOUNT_NOTE}
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

                {lapsed ? (
                  <p className="mt-4 text-sm text-[var(--onside-live-text)]">
                    {LAPSED_COPY[lapsed].cause} Recursos do plano, como o
                    cardápio no perfil, ficam suspensos até{' '}
                    {contractInPlan
                      ? 'o plano ser contratado.'
                      : 'a assinatura ser regularizada. Atualize o método de pagamento em “Gerenciar assinatura”.'}
                  </p>
                ) : subscription?.currentPeriodEnd ? (
                  <p className="mt-4 text-xs text-[var(--onside-muted)]">
                    {getTrialNotice(subscription) ??
                      `Próxima cobrança em ${formatDate(subscription.currentPeriodEnd)}`}
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="mb-4 text-sm text-[var(--onside-muted)]">
                Nenhuma assinatura ativa encontrada.
              </p>
            )}

            <div className="flex flex-wrap gap-3">
              {contractInPlan && planInfo ? (
                <Link
                  to="/plan"
                  search={{ origin: 'billing' }}
                  className="onside-btn onside-btn-acid min-h-11"
                >
                  <ArrowRight
                    size={14}
                    color="currentColor"
                    aria-hidden="true"
                  />
                  Continuar no {planInfo.name}
                </Link>
              ) : null}
              {onLocalTrial && planInfo ? (
                <Link
                  to="/plan"
                  search={{ origin: 'billing' }}
                  className="onside-btn onside-btn-ink min-h-11"
                >
                  <ArrowRight
                    size={14}
                    color="currentColor"
                    aria-hidden="true"
                  />
                  Contratar plano
                </Link>
              ) : null}
              {hasProviderCustomer ? (
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
              ) : null}

              {plan && plan !== 'elite' ? (
                <Link
                  to="/plan"
                  search={{ origin: 'billing' }}
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
                {hasProviderCustomer
                  ? 'Para cancelar, trocar de plano ou atualizar o método de pagamento, use o portal de gerenciamento acima.'
                  : onLocalTrial
                    ? `${TRIAL_NO_CARD_NOTE} Contratando antes do fim, a primeira cobrança só sai quando o teste acabar.`
                    : 'Cancelamento, troca de plano e método de pagamento ficam aqui depois da contratação.'}
              </span>
            </div>
          </section>

          <section className="onside-panel p-6">
            <h2 className="onside-display mb-4 text-2xl">
              Histórico de pagamentos
            </h2>

            <p className="py-4 text-sm text-[var(--onside-muted)]">
              {hasProviderCustomer
                ? 'As faturas e os recibos de cada cobrança ficam no portal, em “Gerenciar assinatura”. O recibo também chega por e-mail a cada pagamento.'
                : 'Nenhum pagamento registrado ainda.'}
            </p>
          </section>
        </div>

        <aside className="space-y-4">
          <h3 className="onside-display text-2xl">Outros planos</h3>
          {PLAN_CATALOG.filter((p) => p.id !== plan).map((info) => {
            const Icon = info.icon
            return (
              <div key={info.id} className="onside-panel p-5">
                <div className="mb-3 flex items-center gap-3">
                  <div className="grid size-9 place-items-center border border-[var(--onside-ink)] bg-[var(--onside-stone)]">
                    <Icon size={16} color="currentColor" aria-hidden="true" />
                  </div>
                  <div>
                    <div className="text-sm font-bold">{info.name}</div>
                    <div className="text-xs text-[var(--onside-muted)]">
                      {formatPlanPricing(info)}
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
                  search={{ origin: 'billing' }}
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
