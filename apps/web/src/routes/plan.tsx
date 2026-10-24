import type { SubscriptionPlan } from '@findsports_oficial/db'
import { Skeleton } from '@findsports_oficial/ui/components/skeleton'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { Fragment, type ReactNode, useState } from 'react'
import { ConfirmPlanDialog } from '@/components/billing/confirm-plan-dialog'
import { DowngradeConfirmDialog } from '@/components/billing/plan-change'
import { Medalha, PlanosFrame } from '@/components/billing/planos'
import planosCss from '@/components/billing/planos.css?url'
import { ReactivateSubscriptionButton } from '@/components/billing/reactivate-subscription-button'
import { TrialStartedDialog } from '@/components/billing/trial-started-dialog'
import {
  Badge,
  Botao,
  type BotaoVariante,
  Chip,
  EmBreve,
  Icone,
  Progresso,
  propsBotao
} from '@/components/painel'
import painelCss from '@/components/painel/painel.css?url'
import { useSession } from '@/hooks/use-session'
import { analytics } from '@/lib/analytics'
import { startCheckout } from '@/lib/billing-client'
import { LAPSED_COPY } from '@/lib/lapsed-plan'
import {
  earnsDowngradeCredit,
  formatPlanPrice,
  founderCouponFromQuery,
  getPlan,
  getPlanExitLink,
  getPlanHeader,
  getPlanPageMode,
  isDowngrade,
  PLAN_CATALOG,
  type PlanOrigin,
  parsePlanOrigin,
  planChargeForShowcase
} from '@/lib/plan-catalog'
import { PLAN_TABLE, type PlanTableCell } from '@/lib/plan-table'
import { PWA_LINKS, PWA_META } from '@/lib/pwa'
import { getCancelNotice } from '@/lib/scheduled-cancel'
import { markCheckoutIntent } from '@/lib/subscription-receipt'
import { getUserFacingError } from '@/lib/user-facing-error'
import { useTRPC } from '@/utils/trpc'

export const Route = createFileRoute('/plan')({
  validateSearch: (
    search: Record<string, unknown>
  ): { origin?: PlanOrigin; trial?: 'started' } => {
    const origin = parsePlanOrigin(search.origin)
    return {
      ...(origin ? { origin } : {}),
      // Vem do fim do cadastro do bar: abre a confirmação do teste.
      ...(search.trial === 'started' ? { trial: 'started' as const } : {})
    }
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
    links: [
      { rel: 'stylesheet', href: painelCss },
      { rel: 'stylesheet', href: planosCss },
      ...PWA_LINKS
    ]
  }),
  component: PlanSelection
})

const DAY_MS = 24 * 60 * 60 * 1000

/** Plano menor confirma antes o que o bar perde (WEB-351), testando ou contratando. */
type Downgrade = { plan: SubscriptionPlan; next: 'trial' | 'checkout' }

/** O botão de cada coluna da tabela. `null`: a coluna não tem ação. */
type ColumnAction = {
  label: string
  variante: BotaoVariante
  onClick?: () => void
  disabled?: boolean
  /** "ou contratar": no teste, contratar outro plano sem testar antes. */
  contratar?: () => void
}

function PlanSelection() {
  const { origin, trial } = Route.useSearch()
  const navigate = Route.useNavigate()
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<SubscriptionPlan | null>(null)
  const [downgrade, setDowngrade] = useState<Downgrade | null>(null)
  const [testing, setTesting] = useState<SubscriptionPlan | null>(null)

  const subscriptionQuery = useQuery({
    ...trpc.pub.getMySubscription.queryOptions(),
    meta: { errorToast: false }
  })
  const founderCouponQuery = useQuery(
    trpc.pub.getFounderCouponAvailable.queryOptions()
  )
  const founderCouponAvailable = founderCouponFromQuery(founderCouponQuery)
  const subscription = subscriptionQuery.data
  const currentPlan = subscription?.currentPlan ?? null
  // Quem vê o quê sai do nosso estado da assinatura, numa função só (WEB-249).
  const mode = getPlanPageMode(subscription)
  const regularize = mode === 'regularize'
  const onTrial = mode === 'trial'
  const header = getPlanHeader(subscription)
  const cancelNotice = getCancelNotice(subscription)
  const exitLink = getPlanExitLink(origin)
  // Assinatura no provedor, vigente ou parada: a troca e a regularização não
  // abrem checkout (WEB-353).
  const hasSubscription =
    Boolean(subscription?.externalSubscriptionId) &&
    subscription?.standing !== 'ended'
  // WEB-328: o checkout não pede nome nem empresa; saem do cadastro. A
  // confirmação diz em nome de quem a assinatura sai.
  const ownerName = useSession()?.user.name ?? null
  const barName =
    useQuery({
      ...trpc.pub.getMe.queryOptions(),
      meta: { errorToast: false }
    }).data?.name ?? null
  const subscriptionErrorFeedback = subscriptionQuery.error
    ? getUserFacingError(
        subscriptionQuery.error,
        'Não foi possível carregar sua assinatura. Tente novamente.'
      )
    : null
  // A coluna marcada: o plano do bar, vigente ou não, e o Pro só para quem
  // nunca teve um (WEB-249).
  const marked =
    (regularize ? subscription?.plan : currentPlan) ??
    subscription?.plan ??
    'pro'
  const trialEnd =
    onTrial && subscription?.currentPeriodEnd
      ? new Date(subscription.currentPeriodEnd)
      : null

  const handleCheckout = async (plan: SubscriptionPlan) => {
    analytics.checkoutStarted(plan)
    // WEB-59: marca nossa, não do provedor. É o que permite a `/plan/confirmed`
    // distinguir quem está voltando do checkout — e merece esperar o webhook —
    // de quem abriu a URL do recibo sem ter assinatura.
    markCheckoutIntent(plan)
    setLoading(true)
    setError(null)

    try {
      // Com URL na resposta o cliente do better-auth já está navegando para
      // o Stripe; ver `startCheckout` (WEB-241).
      if (await startCheckout(plan, currentPlan)) return
      setError('Não foi possível iniciar o pagamento. Tente novamente.')
    } catch (checkoutError) {
      // Plano parado (WEB-172): a recusa do servidor já diz o que fazer.
      const refusal = checkoutError as { code?: string; message?: string }
      setError(
        refusal?.code === 'SUBSCRIPTION_PAST_DUE' && refusal.message
          ? refusal.message
          : 'Não foi possível iniciar o pagamento. Tente novamente.'
      )
    } finally {
      setLoading(false)
    }
  }

  // WEB-358: o teste do cadastro troca de plano sem cartão e sem Stripe. Quem
  // decide se pode é o servidor; a data do fim do teste não muda.
  const trialPlan = useMutation(
    trpc.pub.changeTrialPlan.mutationOptions({
      onMutate: () => {
        setError(null)
        setTesting(null)
      },
      // O plano muda o painel inteiro: limite de jogos, perfil, analytics.
      onSettled: () =>
        Promise.all([
          queryClient.invalidateQueries({ queryKey: trpc.pub.pathKey() }),
          queryClient.invalidateQueries({
            queryKey: trpc.pubs.getById.pathKey()
          }),
          queryClient.invalidateQueries({
            queryKey: trpc.commercialAnalytics.pathKey()
          })
        ]),
      onSuccess: ({ plan }) => setTesting(plan),
      onError: () =>
        setError(
          'Não foi possível trocar o plano do teste. Atualize a página e tente novamente.'
        )
    })
  )

  // Os jogos do bar já estão carregados quando a confirmação de plano menor
  // abre (WEB-351).
  useQuery({
    ...trpc.pub.getMyEvents.queryOptions(),
    enabled: currentPlan !== null && currentPlan !== 'starter',
    meta: { errorToast: false }
  })

  const busy = loading || trialPlan.isPending || subscriptionQuery.isLoading
  /** Contratar `plan`: plano menor passa antes pelo que se perde. */
  const contract = (plan: SubscriptionPlan) => {
    if (currentPlan && isDowngrade(currentPlan, plan)) {
      setDowngrade({ plan, next: 'checkout' })
    } else if (hasSubscription) {
      // Quem já assina troca no portal do Stripe, que mostra a diferença.
      void handleCheckout(plan)
    } else {
      setConfirming(plan)
    }
  }

  const columnAction = (plan: SubscriptionPlan): ColumnAction | null => {
    const name = getPlan(plan).name
    const lower = currentPlan !== null && isDowngrade(currentPlan, plan)
    if (regularize) {
      return plan === subscription?.plan
        ? { label: 'Plano atual', variante: 'sec', disabled: true }
        : null
    }
    if (onTrial) {
      if (plan === currentPlan) {
        return {
          label: `Garantir ${name} · R$ 0`,
          variante: 'acid',
          onClick: () => setConfirming(plan),
          disabled: busy
        }
      }
      return {
        label: `Testar o ${name} grátis`,
        variante: plan === 'starter' ? 'sec' : 'ink',
        disabled: busy,
        onClick: () =>
          lower
            ? setDowngrade({ plan, next: 'trial' })
            : trialPlan.mutate({ plan }),
        contratar: () => contract(plan)
      }
    }
    // No teste grátis o plano vigente ainda não foi contratado; fora dele,
    // é o plano do bar (WEB-31).
    if (plan === currentPlan) {
      return { label: 'Plano atual', variante: 'sec', disabled: true }
    }
    return {
      label: currentPlan
        ? `Mudar para o ${name}`
        : plan === subscription?.plan
          ? `Continuar no ${name}`
          : `Contratar o ${name}`,
      variante: plan === marked ? 'acid' : plan === 'starter' ? 'sec' : 'ink',
      disabled: busy,
      onClick: () => contract(plan)
    }
  }

  const columnBadge = (plan: SubscriptionPlan): ReactNode => {
    if (plan !== marked || !subscription) return null
    if (onTrial) return <Badge tipo="ink">Seu teste</Badge>
    if (
      regularize &&
      subscription.standing &&
      subscription.standing in LAPSED_COPY
    ) {
      return (
        <Badge tipo="live">
          {LAPSED_COPY[subscription.standing as keyof typeof LAPSED_COPY].label}
        </Badge>
      )
    }
    return currentPlan === plan ? <Badge tipo="ink">Seu plano</Badge> : null
  }

  const markedInfo = getPlan(marked)
  const after = planChargeForShowcase(markedInfo, founderCouponAvailable)
  const trialDays =
    trialEnd && subscription?.createdAt
      ? Math.max(
          1,
          Math.round(
            (trialEnd.getTime() - new Date(subscription.createdAt).getTime()) /
              DAY_MS
          )
        )
      : null
  const daysLeft = trialEnd
    ? Math.max(1, Math.ceil((trialEnd.getTime() - Date.now()) / DAY_MS))
    : null
  const used =
    trialDays !== null && daysLeft !== null
      ? Math.min(trialDays, Math.max(0, trialDays - daysLeft))
      : 0
  const until = (format: 'long' | 'short') =>
    trialEnd
      ?.toLocaleDateString('pt-BR', { day: 'numeric', month: format })
      .replace(format === 'short' ? ' de ' : '', ' ')
      .replace('.', '') ?? ''

  return (
    <PlanosFrame
      aside={
        <p className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1 text-[var(--painel-muted)] text-sm">
          {[
            barName,
            onTrial ? `${markedInfo.name} grátis até ${until('short')}` : null
          ]
            .filter(Boolean)
            .join(' · ')}
          <Link to={exitLink.to} className="font-bold text-[var(--painel-fg)]">
            {exitLink.label} →
          </Link>
        </p>
      }
    >
      <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-[26px] px-4 pt-11 pb-16 lg:px-0">
        {subscriptionQuery.isLoading ? (
          <div
            className="pl-tinta grid gap-4 p-8"
            role="status"
            aria-busy="true"
          >
            <span className="sr-only">Carregando assinatura…</span>
            <Skeleton className="h-4 w-40 bg-[#2c2c27]" />
            <Skeleton className="h-14 w-96 max-w-full bg-[#2c2c27]" />
            <Skeleton className="h-5 w-full max-w-xl bg-[#2c2c27]" />
          </div>
        ) : subscriptionQuery.isError ? (
          <div
            className="painel-card flex flex-wrap items-center justify-between gap-3"
            role="alert"
          >
            <p className="text-sm">{subscriptionErrorFeedback?.message}</p>
            {subscriptionErrorFeedback?.retryable ? (
              <Botao onClick={() => subscriptionQuery.refetch()}>
                Tentar novamente
              </Botao>
            ) : null}
          </div>
        ) : onTrial && trialEnd ? (
          <section className="pl-tinta grid items-center gap-9 px-8 py-7 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
            <div className="flex flex-col gap-3">
              <span className="flex items-center gap-2.5">
                <Medalha plano={marked} />
                <span className="font-bold text-[var(--painel-acid)] text-sm">
                  Trial gratuito · sem cartão
                </span>
              </span>
              <h1
                className="painel-disp"
                style={{ '--painel-disp-size': '56px' } as React.CSSProperties}
              >
                Você está no {markedInfo.name}
                <br />
                <span className="text-[var(--painel-acid)]">
                  até {until('long')}.
                </span>
              </h1>
              <p className="max-w-[560px] text-[#d6d3cb] text-[15px] leading-normal">
                {header.text}
              </p>
            </div>
            <div className="flex flex-col gap-3.5">
              <div className="flex items-baseline justify-between">
                <span className="font-[family-name:var(--onside-display)] text-[40px] leading-none">
                  {trialDays} dias
                </span>
                <span className="text-[13px] text-[var(--painel-muted)]">
                  {used} de {trialDays} usados
                </span>
              </div>
              <Progresso
                valor={Math.max(used, 3)}
                max={trialDays ?? 1}
                altura={8}
                rotulo={`${used} de ${trialDays} dias do teste usados`}
              />
              <div className="mt-1 flex flex-wrap items-baseline gap-2">
                <span className="text-[13.5px] text-[var(--painel-muted)]">
                  Depois do teste
                </span>
                <span className="font-[family-name:var(--onside-display)] text-[28px] leading-none">
                  {after ? formatPlanPrice(after.chargeReais) : '…'}
                </span>
                <span className="text-[13px] text-[var(--painel-muted)]">
                  /mês
                </span>
                {after?.listReais != null ? (
                  <span className="text-[13px] text-[var(--painel-muted)] line-through">
                    {formatPlanPrice(after.listReais)}
                  </span>
                ) : null}
              </div>
              <Botao
                variante="acid"
                altura={50}
                className="w-full text-[15px]"
                disabled={busy}
                onClick={() => setConfirming(marked)}
              >
                Garantir o {markedInfo.name} · R$ 0 hoje
              </Botao>
            </div>
          </section>
        ) : (
          <section className="pl-tinta flex flex-col gap-3 px-8 py-7">
            <span className="flex items-center gap-2.5">
              {subscription ? <Medalha plano={marked} /> : null}
              <span className="font-bold text-[var(--painel-acid)] text-sm">
                {header.kicker}
              </span>
            </span>
            <h1
              className="painel-disp"
              style={{ '--painel-disp-size': '48px' } as React.CSSProperties}
            >
              {header.title}
            </h1>
            <p className="max-w-[640px] text-[#d6d3cb] text-[15px] leading-normal">
              {header.text}
            </p>
            {regularize ? (
              <Link
                to="/admin/billing"
                {...propsBotao({ variante: 'acid' }, 'self-start')}
              >
                Regularizar assinatura
              </Link>
            ) : cancelNotice ? (
              <ReactivateSubscriptionButton
                {...propsBotao({ variante: 'acid' }, 'self-start')}
              />
            ) : null}
          </section>
        )}

        {testing ? (
          <p
            role="status"
            className="painel-card font-bold text-[15px]"
            data-kind="acid"
          >
            Agora você está testando o {getPlan(testing).name}. A data do fim do
            teste não mudou.
          </p>
        ) : null}
        {error && !confirming ? (
          <p role="alert" className="text-[var(--painel-live)] text-sm">
            {error}
          </p>
        ) : null}

        <div className="mt-2.5 flex flex-wrap items-end justify-between gap-3">
          <h2
            className="painel-disp"
            style={{ '--painel-disp-size': '52px' } as React.CSSProperties}
          >
            Tudo que muda{' '}
            <span className="text-[var(--painel-tint)]">entre os planos</span>
          </h2>
          <span className="text-[13.5px] text-[var(--painel-muted)]">
            Itens “em breve” ainda não estão disponíveis.
          </span>
        </div>

        <div className="pl-tabela-rolo">
          <div className="pl-tabela" id="planos-tabela">
            <div className="flex flex-col justify-end gap-2 py-5">
              <span className="text-[13.5px] text-[var(--painel-muted)]">
                {founderCouponAvailable
                  ? 'por mês, com desconto de fundador'
                  : 'por mês'}
              </span>
              <span className="flex flex-wrap items-center gap-1.5">
                <Chip ativo check={false}>
                  Mensal
                </Chip>
                <Chip disabled>Anual</Chip>
                <EmBreve />
              </span>
            </div>
            {PLAN_CATALOG.map((info) => {
              const charge = planChargeForShowcase(
                info,
                founderCouponAvailable,
                hasSubscription
              )
              const action = subscriptionQuery.isLoading
                ? null
                : columnAction(info.id)
              return (
                <div
                  key={info.id}
                  className="pl-col flex flex-col gap-2.5 px-3.5 py-5"
                  data-hl={info.id === marked || undefined}
                >
                  <div className="flex items-start justify-between gap-2">
                    <Medalha plano={info.id} tamanho={40} />
                    {columnBadge(info.id)}
                  </div>
                  <h3
                    className="painel-disp"
                    style={
                      { '--painel-disp-size': '30px' } as React.CSSProperties
                    }
                  >
                    {info.name}
                  </h3>
                  <div
                    className="flex flex-wrap items-baseline gap-1.5"
                    aria-busy={charge ? undefined : true}
                  >
                    <span className="font-[family-name:var(--onside-display)] text-[30px] leading-none">
                      {charge ? formatPlanPrice(charge.chargeReais) : '…'}
                    </span>
                    {charge?.listReais != null ? (
                      <span className="text-[12.5px] text-[var(--painel-muted)] line-through">
                        {formatPlanPrice(charge.listReais)}
                      </span>
                    ) : null}
                  </div>
                  {action ? (
                    <>
                      <Botao
                        variante={action.variante}
                        altura={40}
                        className="w-full text-[13.5px]"
                        disabled={action.disabled}
                        onClick={action.onClick}
                      >
                        {action.label}
                      </Botao>
                      {action.contratar ? (
                        <button
                          type="button"
                          className="self-start text-[12.5px] text-[var(--painel-muted)] underline underline-offset-2 disabled:opacity-50"
                          disabled={busy}
                          onClick={action.contratar}
                        >
                          ou contratar o {info.name}
                        </button>
                      ) : null}
                    </>
                  ) : null}
                </div>
              )
            })}

            {PLAN_TABLE.map(({ group, rows }) => (
              <Fragment key={group}>
                <h4 className="col-span-full pt-[22px] pb-2 font-bold text-[13px] text-[var(--painel-tint)]">
                  {group}
                </h4>
                {rows.map((row) => (
                  <Fragment key={row.label}>
                    <div className="pl-celula pl-rotulo">{row.label}</div>
                    {row.values.map((value, index) => {
                      const plan = PLAN_CATALOG[index]?.id
                      return (
                        <div
                          key={plan}
                          className="pl-celula"
                          data-hl={plan === marked || undefined}
                        >
                          <TableCell value={value} strong={plan === marked} />
                        </div>
                      )
                    })}
                  </Fragment>
                ))}
              </Fragment>
            ))}
          </div>
        </div>
      </div>

      {trial === 'started' && onTrial && subscription?.currentPeriodEnd ? (
        <TrialStartedDialog
          plan={subscription.plan}
          until={subscription.currentPeriodEnd}
          onClose={() =>
            navigate({
              search: ({ trial: _, ...rest }) => rest,
              replace: true
            })
          }
        />
      ) : null}

      {downgrade && currentPlan ? (
        <DowngradeConfirmDialog
          from={currentPlan}
          to={downgrade.plan}
          // WEB-350: só assinatura paga no Stripe gera crédito proporcional;
          // em teste grátis não há o que creditar.
          earnsCredit={earnsDowngradeCredit(subscription)}
          onTrial={onTrial}
          confirmLabel={
            downgrade.next === 'trial'
              ? `Testar o ${getPlan(downgrade.plan).name} grátis`
              : hasSubscription
                ? `Mudar para o ${getPlan(downgrade.plan).name}`
                : `Contratar o ${getPlan(downgrade.plan).name}`
          }
          onCancel={() => setDowngrade(null)}
          onConfirm={() => {
            setDowngrade(null)
            if (downgrade.next === 'trial') {
              trialPlan.mutate({ plan: downgrade.plan })
            } else if (hasSubscription) {
              void handleCheckout(downgrade.plan)
            } else {
              setConfirming(downgrade.plan)
            }
          }}
        />
      ) : null}

      {confirming ? (
        <ConfirmPlanDialog
          plan={confirming}
          barName={barName}
          ownerName={ownerName}
          founderCouponAvailable={founderCouponAvailable}
          trialEnd={trialEnd}
          loading={loading}
          error={error}
          onConfirm={() => void handleCheckout(confirming)}
          onClose={() => {
            setConfirming(null)
            setError(null)
          }}
        />
      ) : null}
    </PlanosFrame>
  )
}

function TableCell({
  value,
  strong
}: {
  value: PlanTableCell
  strong: boolean
}) {
  switch (value) {
    case 'sim':
      return (
        <span className="pl-check">
          <Icone nome="check" tamanho={18} acento="currentColor" />
          <span className="sr-only">Sim</span>
        </span>
      )
    case 'nao':
      return (
        <span className="text-[var(--painel-muted)]">
          <span aria-hidden="true">—</span>
          <span className="sr-only">Não</span>
        </span>
      )
    case 'breve':
      return <EmBreve />
    default:
      return <span className={strong ? 'font-bold' : undefined}>{value}</span>
  }
}
