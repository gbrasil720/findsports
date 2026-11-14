import { PLAN_NAMES } from '@findsports_oficial/api/lib/plan-limits'
import type { SubscriptionPlan } from '@findsports_oficial/db'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { type ReactNode, useState } from 'react'
import {
  PaymentChoiceDialog,
  type PaymentMethod
} from '@/components/billing/payment-choice'
import { DowngradeConfirmDialog } from '@/components/billing/plan-change'
import { ReactivateSubscriptionButton } from '@/components/billing/reactivate-subscription-button'
import { PubObShell } from '@/components/onboarding/pub-ob-shell'
import { PLAN_ART } from '@/components/onboarding/pub-plan-step'
import { useFounderCoupon } from '@/hooks/use-founder-coupon'
import { useSession } from '@/hooks/use-session'
import { analytics } from '@/lib/analytics'
import { startCheckout } from '@/lib/billing-client'
import {
  billedPlan,
  earnsDowngradeCredit,
  formatPlanPrice,
  getCommonPlanItems,
  getDefaultPlanSelection,
  getPlan,
  getPlanCardLists,
  getPlanExitLink,
  getPlanHeader,
  getPlanPageMode,
  getTrialNotice,
  getTrialProgress,
  isContractedTrial,
  isDowngrade,
  PLAN_CATALOG,
  type Plan,
  type PlanChargeDisplay,
  type PlanOrigin,
  parsePlanOrigin,
  planChargeForAnnual,
  planChargeForCurrentPlan,
  planChargeForShowcase
} from '@/lib/plan-catalog'
import { PWA_LINKS, PWA_META } from '@/lib/pwa'
import { getCancelNotice, getScheduledCancelAt } from '@/lib/scheduled-cancel'
import { markCheckoutIntent } from '@/lib/subscription-receipt'
import { getUserFacingError } from '@/lib/user-facing-error'
import { useTRPC } from '@/utils/trpc'

export const Route = createFileRoute('/plan')({
  validateSearch: (
    search: Record<string, unknown>
  ): { origin?: PlanOrigin } => {
    const origin = parsePlanOrigin(search.origin)
    return origin ? { origin } : {}
  },
  head: () => ({
    meta: [
      { title: 'Plano e cobrança — Onside' },
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

const ddmm = (value: string | Date) =>
  new Date(value).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit'
  })

const fullDate = (value: string | Date) =>
  new Date(value).toLocaleDateString('pt-BR')

function Tick() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M5 12.5l4.5 4.5L19 7.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function Clock() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <circle
        cx="12"
        cy="12"
        r="8.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M12 7.5V12l3 2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  )
}

/** O nome do plano em destaque no título, como no design. */
function withHighlight(title: string, name: string): ReactNode {
  const at = name ? title.lastIndexOf(name) : -1
  if (at < 0) return title
  return (
    <>
      {title.slice(0, at)}
      <span className="hl">{name}</span>
      {title.slice(at + name.length)}
    </>
  )
}

type CardAction = {
  label: string
  tone: 'acid' | 'ghost'
  disabled?: boolean
  note?: string
  onClick?: () => void
}

function PlanOptionCard({
  plan,
  own,
  badge,
  charge,
  priceLabel,
  priceNote,
  period,
  strike,
  action
}: {
  plan: Plan
  own: boolean
  badge: string | null
  /** `null`: cupom de fundador ainda carregando. */
  charge: PlanChargeDisplay | null
  priceLabel: string
  /** "/mês" ou "/ano" (WEB-442). */
  period: string
  priceNote: string | null
  strike: boolean
  action: CardAction | null
}) {
  // Só o que o plano acrescenta ao anterior; o comum fica abaixo dos cartões.
  const lists = getPlanCardLists(plan)
  return (
    <li className={`pl-pc${own ? ' on' : ''}`} aria-label={plan.name}>
      {badge ? <span className="badge">{badge}</span> : null}
      {/* biome-ignore lint/performance/noImgElement: ilustração estática do plano, de public/, com width e height. */}
      <img
        className="ic"
        src={PLAN_ART[plan.id]}
        alt=""
        width="52"
        height="52"
      />
      <h3>{plan.name}</h3>
      <p className="pd">{plan.tagline}</p>
      <div className="price">
        <p className="ob-k">{priceLabel}</p>
        <div className="pv">
          {charge ? (
            <>
              <b>{formatPlanPrice(charge.chargeReais)}</b>
              <span>{period}</span>
              {strike && charge.listReais ? (
                <s>{formatPlanPrice(charge.listReais)}</s>
              ) : null}
            </>
          ) : (
            <span
              className="pv-load"
              role="status"
              aria-label="Carregando preço"
            />
          )}
        </div>
        {priceNote ? <p className="fine">{priceNote}</p> : null}
      </div>
      <p className="lead">{lists.lead}</p>
      <div className="grp">
        <p className="ob-k">No painel</p>
        <ul>
          {lists.panel.map((feature) => (
            <li key={feature}>
              <Tick />
              {feature}
            </li>
          ))}
        </ul>
      </div>
      {lists.profile.length > 0 ? (
        <div className="grp">
          <p className="ob-k">No perfil que o torcedor vê</p>
          <ul>
            {lists.profile.map((perk) =>
              perk.status === 'soon' ? (
                <li key={perk.label} className="soon">
                  <Clock />
                  <span>
                    {perk.label}
                    <em>EM BREVE</em>
                  </span>
                </li>
              ) : (
                <li key={perk.label}>
                  <Tick />
                  {perk.label}
                </li>
              )
            )}
          </ul>
        </div>
      ) : null}
      {action ? (
        <div className="act">
          <button
            type="button"
            className={`btn btn-${action.tone}`}
            disabled={action.disabled}
            onClick={action.onClick}
          >
            {action.label}
          </button>
          {action.note ? <p className="fine">{action.note}</p> : null}
        </div>
      ) : null}
    </li>
  )
}

function PlanSelection() {
  const { origin } = Route.useSearch()
  const trpc = useTRPC()
  // Plano do checkout que está abrindo: só o botão dele diz "Redirecionando…".
  const [loading, setLoading] = useState<SubscriptionPlan | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Plano menor confirma antes o que o bar perde (WEB-351), contratando ou só
  // trocando o plano do teste (WEB-358).
  const [confirming, setConfirming] = useState<{
    kind: 'checkout' | 'trial'
    to: SubscriptionPlan
  } | null>(null)
  const [testing, setTesting] = useState<SubscriptionPlan | null>(null)
  // "Como você quer pagar?": o plano escolhido, antes do cartão ou do Pix.
  const [choosing, setChoosing] = useState<SubscriptionPlan | null>(null)
  const [payError, setPayError] = useState<string | null>(null)
  // Mensal ou anual (WEB-442). O anual só existe no cartão e só com os
  // preços anuais criados no Stripe; até lá o "Anual" fica "em breve".
  const [annualChosen, setAnnualChosen] = useState(false)
  const annualAvailable = Boolean(
    useQuery({
      ...trpc.pub.getAnnualPlansAvailable.queryOptions(),
      meta: { errorToast: false }
    }).data?.available
  )
  const queryClient = useQueryClient()
  const pixAvailable = Boolean(
    useQuery({
      ...trpc.pub.getPaymentMethods.queryOptions(),
      meta: { errorToast: false }
    }).data?.pix
  )
  const startPix = useMutation(
    trpc.pub.startPixCheckout.mutationOptions({
      onMutate: ({ plan }) => {
        setPayError(null)
        analytics.checkoutStarted(plan)
        markCheckoutIntent(plan)
      },
      // A URL é da AbacatePay: daqui o navegador sai, e o botão segue em
      // "Abrindo…" até a página trocar.
      onSuccess: ({ url }) => {
        window.location.href = url
      },
      onError: (pixError) =>
        setPayError(
          pixError.message ||
            'Não foi possível abrir o Pix agora. Tente de novo.'
        )
    })
  )

  // Pix no fim do teste: só grava a escolha. O painel mostra o aviso e o
  // botão de autorizar, e é para lá que o dono vai.
  const navigate = useNavigate()
  const schedulePix = useMutation(
    trpc.pub.schedulePixAfterTrial.mutationOptions({
      onMutate: () => setPayError(null),
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: trpc.pub.getMySubscription.queryKey()
        })
        await navigate({ to: '/admin/billing' })
      },
      onError: (scheduleError) =>
        setPayError(
          scheduleError.message ||
            'Não foi possível guardar a escolha agora. Tente de novo.'
        )
    })
  )

  const subscriptionQuery = useQuery({
    ...trpc.pub.getMySubscription.queryOptions(),
    meta: { errorToast: false }
  })
  const founderCouponAvailable = useFounderCoupon()
  const subscription = subscriptionQuery.data
  const currentPlan = subscription?.currentPlan ?? null
  // Quem vê o quê sai do nosso estado da assinatura, numa função só (WEB-249).
  const mode = getPlanPageMode(subscription)
  const regularize = mode === 'regularize'
  const onTrial = mode === 'trial'
  const header = getPlanHeader(subscription)
  const trialNotice = getTrialNotice(subscription)
  const cancelNotice = getCancelNotice(subscription)
  const cancelAt = getScheduledCancelAt(subscription)
  const exitLink = getPlanExitLink(origin)
  const earnsCredit = earnsDowngradeCredit(subscription)
  // Assinatura no provedor, vigente ou parada: a troca e a regularização não
  // abrem checkout (WEB-353).
  const hasSubscription =
    Boolean(subscription?.externalSubscriptionId) &&
    subscription?.standing !== 'ended'
  // O anual é para quem vai ao checkout: assinatura que já existe troca de
  // plano no portal, no intervalo em que está (WEB-442).
  const showCycle = !hasSubscription && !regularize
  const annual = showCycle && annualAvailable && annualChosen
  // WEB-328: o checkout não pede nome nem empresa; saem do cadastro. A tela
  // diz em nome de quem a assinatura sai antes de mandar para o Stripe.
  const ownerName = useSession()?.user.name
  const barName = useQuery({
    ...trpc.pub.getMe.queryOptions(),
    meta: { errorToast: false }
  }).data?.name
  const subscriptionErrorFeedback = subscriptionQuery.error
    ? getUserFacingError(
        subscriptionQuery.error,
        'Não foi possível carregar sua assinatura. Tente novamente.'
      )
    : null
  // O plano que a página trata como do bar: o vigente, o parado que se
  // regulariza, ou o do teste ou da assinatura que acabou.
  const ownPlan = regularize
    ? (subscription?.plan ?? null)
    : (currentPlan ?? subscription?.plan ?? null)
  // Sem plano vigente, o que a faixa contrata: o da assinatura, vigente ou
  // não, e o Pro só para quem nunca teve uma (WEB-249).
  const defaultPlan = getDefaultPlanSelection(subscription)

  const handleCheckout = async (plan: SubscriptionPlan) => {
    analytics.checkoutStarted(plan)
    // WEB-59: marca nossa, não do provedor. É o que permite a `/plan/confirmed`
    // distinguir quem está voltando do checkout — e merece esperar o webhook —
    // de quem abriu a URL do recibo sem ter assinatura.
    markCheckoutIntent(plan)
    setLoading(plan)
    setError(null)

    try {
      // Com URL na resposta o cliente do better-auth já está navegando para
      // o Stripe; ver `startCheckout` (WEB-241).
      if (await startCheckout(plan, currentPlan, annual)) return
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
      setLoading(null)
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

  const onPixSubscription =
    subscription?.provider === 'abacatepay' && hasSubscription
  // Contratar passa pela escolha da forma de pagamento quando o Pix está
  // ligado: quem ainda não assina e quem já paga por Pix (a troca de plano
  // no Pix é uma autorização nova). A troca no cartão segue no portal.
  const contract = (plan: SubscriptionPlan) => {
    // O Pix Automático é só mensal: o anual vai direto ao cartão (WEB-442).
    if (!annual && pixAvailable && (!hasSubscription || onPixSubscription)) {
      setPayError(null)
      setChoosing(plan)
      return
    }
    void handleCheckout(plan)
  }

  const busy =
    loading !== null ||
    trialPlan.isPending ||
    subscriptionQuery.isLoading ||
    startPix.isPending ||
    schedulePix.isPending
  const goingDown = (to: SubscriptionPlan) =>
    currentPlan !== null && isDowngrade(currentPlan, to)
  // Os jogos do bar já estão carregados quando a confirmação de plano menor
  // abre (WEB-351).
  useQuery({
    ...trpc.pub.getMyEvents.queryOptions(),
    enabled:
      currentPlan !== null &&
      PLAN_CATALOG.some((plan) => isDowngrade(currentPlan, plan.id)),
    meta: { errorToast: false }
  })

  const checkoutLabel = (plan: SubscriptionPlan) =>
    loading === plan
      ? 'Redirecionando…'
      : `Contratar o ${PLAN_NAMES[plan]}${annual ? ' anual' : ''}`

  function cardAction(plan: Plan): CardAction | null {
    // Assinatura paga parada não passa pelo checkout: a faixa leva a
    // regularizar (WEB-170).
    if (regularize) return null
    if (onTrial) {
      // No teste, cada cartão testa o próprio plano, sem cartão (WEB-358).
      if (plan.id === subscription?.plan) {
        return {
          label: `Você está testando o ${plan.name}`,
          tone: 'ghost',
          disabled: true
        }
      }
      return {
        label:
          trialPlan.isPending && trialPlan.variables?.plan === plan.id
            ? 'Trocando…'
            : `Testar o ${plan.name} grátis`,
        tone: 'ghost',
        disabled: busy,
        onClick: () =>
          goingDown(plan.id)
            ? setConfirming({ kind: 'trial', to: plan.id })
            : trialPlan.mutate({ plan: plan.id })
      }
    }
    if (currentPlan) {
      if (plan.id === currentPlan) {
        return { label: 'Seu plano atual', tone: 'ghost', disabled: true }
      }
      const down = goingDown(plan.id)
      const diff = plan.tablePrice - getPlan(currentPlan).tablePrice
      return {
        label:
          loading === plan.id ? 'Redirecionando…' : `Mudar para o ${plan.name}`,
        tone: down ? 'ghost' : 'acid',
        disabled: busy,
        // O desconto de fundador é o mesmo em todos os planos: a diferença é
        // a da tabela. Proporcional só onde há cobrança no Stripe (WEB-350).
        note: down
          ? 'Mostramos antes o que o bar perde.'
          : `+${formatPlanPrice(diff)}/mês.${earnsCredit ? ' A diferença deste mês sai proporcional.' : ''}`,
        onClick: down
          ? () => setConfirming({ kind: 'checkout', to: plan.id })
          : () => contract(plan.id)
      }
    }
    return {
      label: checkoutLabel(plan.id),
      tone: plan.id === defaultPlan ? 'acid' : 'ghost',
      disabled: busy,
      onClick: () => contract(plan.id)
    }
  }

  function badgeFor(plan: Plan): string | null {
    if (plan.id !== ownPlan) return null
    if (onTrial) return 'TESTANDO AGORA'
    if (currentPlan || regularize) return 'SEU PLANO'
    if (subscription?.standing === 'trial_ended') return 'SEU TESTE'
    return 'ÚLTIMO PLANO'
  }

  function priceFor(plan: Plan) {
    const own = plan.id === ownPlan && hasSubscription
    if (own && subscription) {
      const contracted = isContractedTrial(subscription)
      return {
        label: 'Você paga',
        charge: planChargeForCurrentPlan(
          billedPlan(plan, subscription.billingInterval),
          subscription,
          founderCouponAvailable
        ),
        strike: false,
        period: subscription.billingInterval === 'year' ? '/ano' : plan.period,
        note:
          subscription.standing !== 'current' || !subscription.currentPeriodEnd
            ? null
            : cancelAt
              ? `Vai até ${ddmm(cancelAt)}.`
              : contracted
                ? `Primeira cobrança em ${ddmm(subscription.currentPeriodEnd)}.`
                : `Renova em ${ddmm(subscription.currentPeriodEnd)}.`
      }
    }
    if (annual) {
      // 10 meses riscando os 12; o cupom de fundador é só do mensal.
      return {
        label: onTrial ? 'Depois do teste' : 'Por ano',
        charge: planChargeForAnnual(plan),
        strike: true,
        period: '/ano',
        note: onTrial
          ? '2 meses grátis, só se você contratar.'
          : '2 meses grátis, no cartão.'
      }
    }
    const charge = planChargeForShowcase(
      plan,
      founderCouponAvailable,
      hasSubscription
    )
    const founder = Boolean(charge?.listReais)
    if (onTrial) {
      return {
        label: 'Depois do teste',
        charge,
        strike: true,
        period: plan.period,
        note: founder
          ? 'Preço de fundador, só se você contratar.'
          : 'Só se você contratar.'
      }
    }
    return {
      label: founder ? 'Preço de fundador' : 'Por mês',
      charge,
      strike: !hasSubscription,
      period: plan.period,
      note: null
    }
  }

  const placar = (() => {
    if (!subscription?.standing || subscription.standing === 'ended') {
      return null
    }
    const name = getPlan(subscription.plan).name.toUpperCase()
    const end = subscription.currentPeriodEnd
    const charge = planChargeForCurrentPlan(
      billedPlan(getPlan(subscription.plan), subscription.billingInterval),
      subscription,
      founderCouponAvailable
    )
    const price = charge ? formatPlanPrice(charge.chargeReais) : '…'
    const perLabel =
      subscription.billingInterval === 'year' ? 'Por ano' : 'Por mês'
    if (subscription.standing === 'past_due') {
      return {
        label: 'Sua assinatura',
        warn: true,
        progress: 1,
        cells: [
          ['Plano', name],
          ['Fatura', price],
          ['Pagamento', 'PENDENTE']
        ]
      }
    }
    if (subscription.standing === 'trial_ended') {
      return {
        label: 'Seu teste grátis',
        warn: true,
        progress: 1,
        cells: [
          ['Testou', name],
          ['Acabou em', end ? ddmm(end) : '—']
        ]
      }
    }
    if (subscription.status === 'trialing' && end) {
      const { daysLeft, elapsed } = getTrialProgress(end)
      return {
        label: 'Seu teste grátis',
        warn: false,
        progress: elapsed,
        cells: onTrial
          ? [
              ['Testando', name],
              ['Faltam', daysLeft, daysLeft === 1 ? 'dia' : 'dias'],
              ['Até', ddmm(end)],
              ['Cartão', 'NÃO']
            ]
          : [
              ['Plano', name],
              [perLabel, price],
              ['1ª cobrança', ddmm(end)]
            ]
      }
    }
    // Plano pago: sem o começo do ciclo nem o cartão no nosso banco, o placar
    // diz só o que sabemos, sem barra.
    return {
      label: 'Sua assinatura',
      warn: false,
      progress: null,
      cells: [
        ['Plano', name],
        [perLabel, price],
        cancelAt
          ? ['Cancela', ddmm(cancelAt)]
          : ['Renova', end ? ddmm(end) : '—']
      ]
    }
  })()

  const names =
    ownerName && barName ? (
      <>
        <b>{ownerName}</b> · <b>{barName}</b>
      </>
    ) : null
  const renameLink = (
    <Link to="/admin/meu-espaco">
      Alterar<span className="sr-only"> o nome do bar</span>
    </Link>
  )

  // A faixa de baixo: em nome de quem, voltar e a ação principal do modo.
  let who: ReactNode = null
  let primary: ReactNode = null
  if (regularize) {
    // Sem checkout, não há o que anunciar (WEB-328).
    primary = (
      <Link to="/admin/billing" className="btn btn-acid">
        Atualizar pagamento
      </Link>
    )
  } else if (onTrial && subscription) {
    const firstCharge = subscription.currentPeriodEnd
      ? fullDate(subscription.currentPeriodEnd)
      : 'o fim do teste'
    who = (
      <>
        {/* WEB-328: em nome de quem, também no celular. */}
        {names ? (
          <>
            A assinatura sai em nome de {names}. {renameLink}
            <br />
          </>
        ) : null}
        <span className="pl-lg">
          No cartão, contratar agora não antecipa nada: a primeira cobrança é em{' '}
          {firstCharge}.
          {pixAvailable && !annual
            ? subscription.pixAfterTrialAt
              ? ' Você escolheu o Pix: a gente avisa perto do fim para autorizar.'
              : ' No Pix também: a autorização é pedida perto do fim.'
            : ''}
        </span>
        <span className="pl-sm">Primeira cobrança só em {firstCharge}.</span>
      </>
    )
    primary = (
      <button
        type="button"
        className="btn btn-acid"
        disabled={busy}
        onClick={() => contract(subscription.plan)}
      >
        {checkoutLabel(subscription.plan)}
      </button>
    )
  } else if (currentPlan && subscription) {
    who = (
      <>
        {names ? <>Cobrado de {names}. </> : null}
        {cancelNotice
          ? `${cancelNotice}. `
          : trialNotice
            ? `${trialNotice}. `
            : null}
        <span className="pl-lg">
          Faturas e dados da nota ficam em{' '}
          <Link to="/admin/billing">Assinatura e pagamentos</Link>.
        </span>
        <span className="pl-sm">
          Cartão, faturas e cancelamento ficam no Stripe.
        </span>
      </>
    )
    primary = (
      <ReactivateSubscriptionButton
        className={`btn ${cancelAt ? 'btn-acid' : 'btn-ink'}`}
        label={
          cancelAt
            ? `Manter o ${getPlan(currentPlan).name}`
            : 'Gerenciar pagamento'
        }
      />
    )
  } else if (!subscriptionQuery.isLoading) {
    who = names ? (
      <>
        A assinatura sai em nome de {names}. {renameLink}
      </>
    ) : null
    primary = (
      <button
        type="button"
        className="btn btn-acid"
        disabled={busy}
        onClick={() => contract(defaultPlan)}
      >
        {checkoutLabel(defaultPlan)}
      </button>
    )
  }

  const tone =
    subscription?.standing === 'past_due'
      ? 'red'
      : subscription?.standing === 'trial_ended' || cancelAt
        ? 'off'
        : null
  const confirmLabel = confirming
    ? confirming.kind === 'trial'
      ? `Testar o ${PLAN_NAMES[confirming.to]} grátis`
      : `Mudar para o ${PLAN_NAMES[confirming.to]}`
    : ''

  return (
    <PubObShell wide pill={barName}>
      <div className="pl3">
        {subscriptionQuery.isLoading ? (
          <div role="status" aria-busy="true" aria-live="polite">
            <span className="sr-only">Carregando assinatura…</span>
            <p className="ob-k">Plano</p>
            <h1 className="ob-h">Carregando…</h1>
          </div>
        ) : (
          <div>
            {tone ? (
              <p className={`pl-chip ${tone}`}>{header.kicker}</p>
            ) : (
              <p className="ob-k">{header.kicker}</p>
            )}
            <h1 className="ob-h">
              {withHighlight(
                header.title,
                subscription ? getPlan(subscription.plan).name : ''
              )}
            </h1>
            <p className="ob-sub">
              {header.short ? (
                <>
                  <span className="pl-lg">{header.text}</span>
                  <span className="pl-sm">{header.short}</span>
                </>
              ) : (
                header.text
              )}
            </p>
          </div>
        )}

        {subscriptionQuery.isError ? (
          <div className="pl-msg err" role="alert">
            <p>{subscriptionErrorFeedback?.message}</p>
            {subscriptionErrorFeedback?.retryable ? (
              <button
                type="button"
                onClick={() => subscriptionQuery.refetch()}
                className="btn btn-ghost"
              >
                Tentar novamente
              </button>
            ) : null}
          </div>
        ) : null}

        {placar && subscription ? (
          <section
            className={`placar${placar.warn ? ' warn' : ''}`}
            aria-label={placar.label}
          >
            <div className="pl-l">
              {/* biome-ignore lint/performance/noImgElement: ilustração estática do plano, de public/, com width e height. */}
              <img
                src={PLAN_ART[subscription.plan]}
                alt=""
                width="56"
                height="56"
              />
            </div>
            <dl className="pl-r">
              {placar.cells.map(([label, value, unit]) => (
                <div key={label} className="cell">
                  <dt>{label}</dt>
                  <dd>
                    {value}
                    {unit ? <small>{unit}</small> : null}
                  </dd>
                </div>
              ))}
            </dl>
            {placar.progress !== null ? (
              <div className="bar" aria-hidden="true">
                <i style={{ width: `${placar.progress * 100}%` }} />
              </div>
            ) : null}
          </section>
        ) : null}

        {showCycle ? (
          <fieldset className="pl-cycle">
            <legend className="sr-only">Cobrança</legend>
            <button
              type="button"
              aria-pressed={!annual}
              onClick={() => setAnnualChosen(false)}
            >
              Mensal
            </button>
            <button
              type="button"
              aria-pressed={annual}
              disabled={!annualAvailable}
              onClick={() => setAnnualChosen(true)}
            >
              Anual
              <em>{annualAvailable ? '2 MESES GRÁTIS' : 'EM BREVE'}</em>
            </button>
          </fieldset>
        ) : null}

        <ul className="pl-plans" aria-label="Planos">
          {PLAN_CATALOG.map((plan) => {
            const price = priceFor(plan)
            return (
              <PlanOptionCard
                key={plan.id}
                plan={plan}
                own={plan.id === ownPlan}
                badge={badgeFor(plan)}
                charge={price.charge}
                priceLabel={price.label}
                priceNote={price.note}
                period={price.period}
                strike={price.strike}
                action={cardAction(plan)}
              />
            )
          })}
        </ul>
        <p className="pl-common">
          <b>Em todos os planos</b>
          {getCommonPlanItems().join(' · ')}
        </p>

        {testing ? (
          <p className="pl-msg ok" role="status">
            Agora você está testando o {PLAN_NAMES[testing]}. A data do fim do
            teste não mudou.
          </p>
        ) : null}

        {error ? (
          <p className="pl-msg err" role="alert" aria-live="assertive">
            {error}
          </p>
        ) : null}

        <div className="dock">
          {who ? <p className="who">{who}</p> : null}
          <div className="acts">
            <Link to={exitLink.to} className="btn btn-ghost">
              {exitLink.label}
            </Link>
            {primary}
          </div>
        </div>
      </div>

      {choosing ? (
        <PaymentChoiceDialog
          plan={choosing}
          chargeReais={
            planChargeForShowcase(
              getPlan(choosing),
              founderCouponAvailable,
              false
            )?.chargeReais ?? null
          }
          listReais={
            planChargeForShowcase(
              getPlan(choosing),
              founderCouponAvailable,
              false
            )?.listReais ?? null
          }
          trialEnd={
            onTrial && subscription?.currentPeriodEnd
              ? subscription.currentPeriodEnd
              : null
          }
          pixPlanChange={
            onPixSubscription && currentPlan && currentPlan !== choosing
              ? currentPlan
              : null
          }
          pending={
            startPix.isPending || startPix.isSuccess || schedulePix.isPending
              ? 'pix'
              : loading
                ? 'card'
                : null
          }
          error={payError}
          onCancel={() => setChoosing(null)}
          onConfirm={(method: PaymentMethod, timing) => {
            if (method === 'pix' && timing === 'trial_end')
              schedulePix.mutate({ plan: choosing })
            else if (method === 'pix') startPix.mutate({ plan: choosing })
            else void handleCheckout(choosing)
          }}
        />
      ) : null}

      {confirming && currentPlan ? (
        <DowngradeConfirmDialog
          from={currentPlan}
          to={confirming.to}
          // WEB-350: só assinatura paga no Stripe gera crédito proporcional;
          // em teste grátis não há o que creditar.
          earnsCredit={earnsCredit}
          onTrial={onTrial}
          confirmLabel={confirmLabel}
          onCancel={() => setConfirming(null)}
          onConfirm={() => {
            const { kind, to } = confirming
            setConfirming(null)
            if (kind === 'trial') trialPlan.mutate({ plan: to })
            else contract(to)
          }}
        />
      ) : null}
    </PubObShell>
  )
}
