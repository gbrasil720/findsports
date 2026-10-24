import { Skeleton } from '@findsports_oficial/ui/components/skeleton'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { type ReactNode, useId, useState } from 'react'
import { useMyBar, useMyEvents } from '@/components/admin/admin-queries'
import {
  CancelPlanDialog,
  type PerdaCancelamento
} from '@/components/billing/cancel-plan-dialog'
import { PlanChangedNotice } from '@/components/billing/plan-change'
import planosCss from '@/components/billing/planos.css?url'
import { ReactivateSubscriptionButton } from '@/components/billing/reactivate-subscription-button'
import {
  Badge,
  type BadgeTipo,
  Botao,
  CabecalhoPagina,
  Card,
  EmBreve,
  Icone,
  type IconeNome,
  Medalha,
  propsBotao
} from '@/components/painel'
import { getEventTemporalState } from '@/domain/events'
import { analytics } from '@/lib/analytics'
import { openBillingPortal } from '@/lib/billing-client'
import { isLapsed, LAPSED_COPY } from '@/lib/lapsed-plan'
import {
  CONTRACTED_TRIAL_LABEL,
  formatPlanPrice,
  founderCouponFromQuery,
  getPlan,
  getPlanPageMode,
  getTrialNotice,
  isContractedTrial,
  parsePlanChange,
  planChargeForCurrentPlan,
  TRIAL_NO_CARD_NOTE
} from '@/lib/plan-catalog'
import { canCancelSubscription, getCancelNotice } from '@/lib/scheduled-cancel'
import { getUserFacingError } from '@/lib/user-facing-error'
import { useTRPC } from '@/utils/trpc'

export const Route = createFileRoute('/admin/billing')({
  validateSearch: parsePlanChange,
  head: () => ({
    meta: [
      { title: 'Plano e cobrança — Onside' },
      { name: 'robots', content: 'noindex' }
    ],
    links: [{ rel: 'stylesheet', href: planosCss }]
  }),
  component: BillingPage
})

const SUPPORT_EMAIL = 'contato@onside.sh'

const reais = (value: number) =>
  value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const diaMes = (date: string | Date) =>
  new Date(date)
    .toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })
    .replace('.', '')
    .replace(' de ', ' ')

/** Situação que não é a de sempre (ativo) ganha selo; por `status`, mais `trial_ended`. */
const STATUS_BADGE: Record<string, { label: string; tipo: BadgeTipo }> = {
  trialing: { label: 'Trial gratuito', tipo: 'acid' },
  // Trial que já é do Stripe: contratou antes do fim (WEB-347).
  contracted_trial: { label: CONTRACTED_TRIAL_LABEL, tipo: 'acid' },
  past_due: { label: LAPSED_COPY.past_due.label, tipo: 'live' },
  trial_ended: { label: LAPSED_COPY.trial_ended.label, tipo: 'live' },
  inactive: { label: 'Inativo', tipo: 'live' },
  cancelled: { label: 'Cancelado', tipo: 'pub' }
}

/** Primeiro e último dia do mês corrente em Brasília (`YYYY-MM-DD`). */
function thisMonth() {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo'
  }).format(new Date())
  return { from: `${today.slice(0, 8)}01`, to: today }
}

function BillingPage() {
  const trpc = useTRPC()
  const session = Route.useRouteContext({ select: (ctx) => ctx.session })
  const { planFrom, planTo } = Route.useSearch()
  const [openingPortal, setOpeningPortal] = useState(false)
  const [portalError, setPortalError] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const bar = useMyBar().data

  // A seção desenha o próprio erro, com botão de tentar de novo; o toast
  // global repetiria a mesma falha.
  const subscriptionQuery = useQuery({
    ...trpc.pub.getMySubscription.queryOptions(),
    meta: { errorToast: false }
  })
  const founderCouponQuery = useQuery(
    trpc.pub.getFounderCouponAvailable.queryOptions()
  )
  const subscription = subscriptionQuery.data
  const loadingSub = subscriptionQuery.isLoading
  // Saldo, próxima fatura e cartão vêm do Stripe (WEB-350), em consulta à
  // parte: enquanto carrega, ou se o Stripe falhar, a página segue sem eles.
  const balance = useQuery({
    ...trpc.pub.getMyBillingBalance.queryOptions(),
    enabled: Boolean(subscription?.externalSubscriptionId),
    meta: { errorToast: false },
    retry: false
  }).data
  // O que o plano rendeu no mês: só números que o servidor calcula. Sem
  // analytics (plano parado, falha), a linha some.
  const month = thisMonth()
  const overview = useQuery({
    ...trpc.commercialAnalytics.getMyAnalyticsOverview.queryOptions(month),
    enabled: Boolean(subscription?.currentPlan),
    meta: { errorToast: false },
    retry: false
  }).data

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
  // Assinatura encerrada também mostra o plano contratado, com o selo dizendo
  // se foi cancelada ou pausada (WEB-60).
  const ended = standing === 'ended'
  const shownPlan = plan ?? (lapsed || ended ? subscription?.plan : null)
  const planInfo = shownPlan ? getPlan(shownPlan) : null
  const founderCouponAvailable = founderCouponFromQuery(founderCouponQuery)
  const planCharge =
    planInfo && subscription
      ? planChargeForCurrentPlan(planInfo, subscription, founderCouponAvailable)
      : null
  const status =
    STATUS_BADGE[
      isContractedTrial(subscription)
        ? 'contracted_trial'
        : standing === 'trial_ended'
          ? standing
          : (subscription?.status ?? '')
    ]
  const cancelNotice = getCancelNotice(subscription)
  const canCancel = canCancelSubscription(subscription)
  // Renovação só de quem segue pagando: plano parado, encerrado ou com
  // cancelamento marcado não renova.
  const renewal =
    subscription?.currentPeriodEnd && !lapsed && !ended && !cancelNotice
      ? (getTrialNotice(subscription) ??
        `por mês · renova ${diaMes(subscription.currentPeriodEnd)}`)
      : 'por mês'
  const planNote = lapsed
    ? `${LAPSED_COPY[lapsed].cause} ${
        contractInPlan
          ? 'O bar sai das buscas e do mapa até um plano ser contratado.'
          : 'Recursos do plano, como o cardápio no perfil, ficam suspensos até a assinatura ser regularizada. Atualize o método de pagamento em “Gerenciar assinatura”.'
      }`
    : ended
      ? 'Assinatura encerrada: o bar fica fora das buscas e do mapa até um plano ser contratado.'
      : null

  const kpis: { valor: number; rotulo: string }[] = overview
    ? [
        { valor: overview.uniqueVisitors, rotulo: 'viram o bar' },
        { valor: overview.interestedPeople, rotulo: 'se interessaram' },
        ...(overview.classicExposures !== null
          ? [
              {
                valor: overview.classicExposures,
                rotulo: 'vezes no topo em clássicos'
              }
            ]
          : [])
      ]
    : []

  return (
    <>
      <CabecalhoPagina
        kicker="Assinatura e pagamentos"
        titulo="Plano e cobrança"
        acoes={
          <Link to="/plan" search={{ origin: 'billing' }} {...propsBotao()}>
            Ver todos os planos
          </Link>
        }
      />

      <PlanChangedNotice
        pending={planFrom && planTo ? { from: planFrom, to: planTo } : null}
      />

      <div className="grid items-start gap-[22px] lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-[22px]">
          {loadingSub ? (
            <div
              className="pl-tinta flex flex-col gap-4 px-[26px] py-6"
              aria-busy="true"
              aria-live="polite"
            >
              <span className="sr-only">Carregando assinatura…</span>
              <Skeleton className="h-12 w-48 bg-[#2c2c27]" />
              <Skeleton className="h-16 w-full bg-[#2c2c27]" />
            </div>
          ) : subscriptionQuery.isError ? (
            <Card
              role="alert"
              className="flex flex-wrap items-center justify-between gap-3"
            >
              <p className="text-sm">{subscriptionErrorFeedback?.message}</p>
              {subscriptionErrorFeedback?.retryable ? (
                <Botao onClick={() => subscriptionQuery.refetch()}>
                  Tentar novamente
                </Botao>
              ) : null}
            </Card>
          ) : planInfo && shownPlan ? (
            <section
              aria-labelledby="seu-plano"
              className="pl-tinta flex flex-col gap-[18px] px-[26px] py-6"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <Medalha plano={shownPlan} tamanho={52} sobreTinta />
                  <div>
                    <h2
                      id="seu-plano"
                      className="font-normal text-[13px] text-[var(--painel-muted)]"
                    >
                      Seu plano
                    </h2>
                    <p className="font-[family-name:var(--onside-display)] text-[48px] text-[var(--painel-acid)] uppercase leading-none">
                      {planInfo.name}
                    </p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 text-right">
                  {planCharge ? (
                    <div className="flex items-baseline gap-2">
                      {planCharge.listReais != null ? (
                        <span className="text-[13px] text-[var(--painel-muted)] line-through">
                          {formatPlanPrice(planCharge.listReais)}
                        </span>
                      ) : null}
                      <span className="font-[family-name:var(--onside-display)] text-[32px] leading-none">
                        {formatPlanPrice(planCharge.chargeReais)}
                      </span>
                    </div>
                  ) : (
                    <Skeleton className="h-8 w-24 bg-[#2c2c27]" />
                  )}
                  <span className="text-[13px] text-[var(--painel-muted)]">
                    {renewal}
                  </span>
                  <span className="mt-1 flex flex-wrap justify-end gap-1.5">
                    {status ? (
                      <Badge tipo={status.tipo}>{status.label}</Badge>
                    ) : null}
                    {planCharge?.listReais != null ? (
                      <Badge tipo="acid">Preço de fundador</Badge>
                    ) : null}
                  </span>
                </div>
              </div>

              {planNote ? (
                <p className="text-[#f3421d] text-sm">{planNote}</p>
              ) : cancelNotice ? (
                <p className="text-[var(--painel-muted)] text-sm">
                  {cancelNotice}.{' '}
                  <ReactivateSubscriptionButton className="font-bold text-[var(--painel-fg)] underline underline-offset-2" />
                </p>
              ) : onLocalTrial ? (
                <p className="text-[var(--painel-muted)] text-sm">
                  {TRIAL_NO_CARD_NOTE} Contratando antes do fim, a primeira
                  cobrança só sai quando o teste acabar.
                </p>
              ) : null}

              {kpis.length > 0 ? (
                <dl className="grid grid-cols-3 gap-2.5 border-[var(--painel-line)] border-t pt-4">
                  {kpis.map((kpi) => (
                    <div
                      key={kpi.rotulo}
                      className="flex flex-col-reverse justify-end"
                    >
                      <dt className="mt-[3px] text-[12.5px] text-[var(--painel-muted)]">
                        {kpi.rotulo} este mês
                      </dt>
                      <dd className="font-[family-name:var(--onside-display)] text-[30px] leading-none">
                        {kpi.valor.toLocaleString('pt-BR')}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : null}

              <div className="flex flex-wrap gap-2.5">
                {contractInPlan ? (
                  <Link
                    to="/plan"
                    search={{ origin: 'billing' }}
                    {...propsBotao({ variante: 'acid' }, '!flex-1')}
                  >
                    Continuar no {planInfo.name}
                  </Link>
                ) : onLocalTrial || ended ? (
                  <Link
                    to="/plan"
                    search={{ origin: 'billing' }}
                    {...propsBotao({ variante: 'acid' }, '!flex-1')}
                  >
                    Contratar plano
                  </Link>
                ) : lapsed && hasProviderCustomer ? (
                  <Botao
                    variante="acid"
                    className="!flex-1"
                    disabled={openingPortal}
                    onClick={handleOpenPortal}
                  >
                    {openingPortal
                      ? 'Abrindo portal…'
                      : 'Regularizar no portal'}
                  </Botao>
                ) : (
                  <Link
                    to="/plan"
                    search={{ origin: 'billing' }}
                    onClick={() => {
                      if (plan && plan !== 'elite') {
                        analytics.upgradeClicked(
                          plan,
                          plan === 'starter' ? 'pro' : 'elite'
                        )
                      }
                    }}
                    {...propsBotao({ variante: 'acid' }, '!flex-1')}
                  >
                    Trocar plano
                  </Link>
                )}
                <Link
                  to="/plan"
                  search={{ origin: 'billing' }}
                  hash="planos-tabela"
                  {...propsBotao({ variante: 'sec' }, '!flex-1')}
                >
                  Ver benefícios
                </Link>
              </div>
            </section>
          ) : (
            <Card className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm">Nenhuma assinatura ativa encontrada.</p>
              <Link
                to="/plan"
                search={{ origin: 'billing' }}
                {...propsBotao({ variante: 'acid' })}
              >
                Contratar plano
              </Link>
            </Card>
          )}

          <Secao titulo="Faturas" icone="doc" aside={<EmBreve />}>
            <p className="py-3 text-[13.5px] text-[var(--painel-muted)] leading-normal">
              {hasProviderCustomer
                ? 'As faturas e os recibos de cada cobrança ficam no portal da Stripe, e o recibo também chega por e-mail a cada pagamento.'
                : 'Nenhum pagamento registrado ainda.'}
            </p>
            {hasProviderCustomer ? (
              <Botao
                altura={40}
                disabled={openingPortal || loadingSub}
                onClick={handleOpenPortal}
              >
                {openingPortal ? 'Abrindo portal…' : 'Gerenciar assinatura'}
              </Botao>
            ) : null}
            {portalError ? (
              <p
                className="mt-3 text-[var(--painel-live)] text-sm"
                role="alert"
              >
                {portalError}
              </p>
            ) : null}
          </Secao>
        </div>

        <div className="flex flex-col gap-[22px]">
          <Secao titulo="Pagamento" icone="card">
            <Linha
              titulo={
                balance?.card ? `Cartão •••• ${balance.card.last4}` : 'Cartão'
              }
              sub={
                balance?.card
                  ? 'Salvo na sua assinatura'
                  : hasProviderCustomer
                    ? 'O cartão fica no portal da Stripe'
                    : 'Pedido no checkout, quando você contratar'
              }
              acao={
                hasProviderCustomer ? (
                  <Botao
                    altura={36}
                    className="text-[13px]"
                    disabled={openingPortal}
                    onClick={handleOpenPortal}
                  >
                    Trocar
                  </Botao>
                ) : null
              }
              primeira
            />
            {balance?.nextChargeReais != null ? (
              <Linha
                titulo="Próxima cobrança"
                sub={`Valor da próxima cobrança: ${reais(balance.nextChargeReais)}`}
              />
            ) : null}
            {balance?.creditReais != null ? (
              <Linha
                titulo={`${reais(balance.creditReais)} de crédito`}
                sub="As próximas cobranças serão descontadas dele."
              />
            ) : null}
            <Linha
              titulo="PIX"
              sub="Pagar a próxima fatura por PIX"
              selo
              acao={
                <Botao altura={36} className="text-[13px]" disabled>
                  Usar PIX
                </Botao>
              }
            />
          </Secao>

          <Secao titulo="Dados da nota" icone="doc" aside={<EmBreve />}>
            {['Razão social', 'CNPJ', 'E-mail para notas'].map(
              (titulo, index) => (
                <Linha
                  key={titulo}
                  titulo={titulo}
                  primeira={index === 0}
                  acao={
                    <button
                      type="button"
                      disabled
                      className="font-bold text-[13.5px] opacity-50"
                    >
                      Editar
                    </button>
                  }
                />
              )
            )}
          </Secao>

          <Secao titulo="Ajuda" icone="chat">
            <Linha
              titulo="Dúvidas sobre cobrança"
              sub={SUPPORT_EMAIL}
              primeira
              acao={
                <a
                  href={`mailto:${SUPPORT_EMAIL}`}
                  className="font-bold text-[13.5px]"
                >
                  Falar com a gente →
                </a>
              }
            />
          </Secao>

          {canCancel ? (
            <button
              type="button"
              onClick={() => setCancelling(true)}
              className="self-start pl-1 font-bold text-[14px] text-[var(--painel-live)]"
            >
              Cancelar plano
            </button>
          ) : null}
        </div>
      </div>

      {cancelling && shownPlan ? (
        <CancelPlan
          plan={shownPlan}
          barName={bar?.name ?? 'bar'}
          until={
            subscription?.currentPeriodEnd
              ? new Date(subscription.currentPeriodEnd)
              : null
          }
          monthlyDiscountReais={subscription?.monthlyDiscountReais ?? null}
          visitors={overview?.uniqueVisitors ?? null}
          classics={overview?.classicExposures ?? null}
          onClose={() => setCancelling(false)}
        />
      ) : null}
    </>
  )
}

/**
 * O que o bar perde, com os números que existem (3q): quem viu o bar no mês,
 * as vezes no topo dos clássicos (Elite), os jogos marcados e o pin.
 */
function CancelPlan({
  visitors,
  classics,
  ...props
}: Omit<Parameters<typeof CancelPlanDialog>[0], 'perdas'> & {
  visitors: number | null
  classics: number | null
}) {
  const events = useMyEvents().data
  const upcoming = events?.filter(
    (item) => getEventTemporalState(item.startsAt, item.endsAt) !== 'past'
  ).length
  const perdas: PerdaCancelamento[] = [
    ...(visitors !== null
      ? [{ valor: visitors, rotulo: 'pessoas que viram o bar este mês' }]
      : []),
    ...(classics !== null
      ? [
          {
            valor: classics,
            rotulo: 'vezes com o bar no topo da busca em clássicos este mês'
          }
        ]
      : []),
    ...(upcoming
      ? [{ valor: upcoming, rotulo: 'jogos marcados saem das buscas' }]
      : []),
    ...(props.plan === 'elite'
      ? [{ valor: 1, rotulo: 'pin exclusivo no mapa' }]
      : [])
  ]
  return <CancelPlanDialog {...props} perdas={perdas} />
}

/** Card de seção (`sec` do design): ícone, título e, à direita, um selo. */
function Secao({
  titulo,
  icone,
  aside,
  children
}: {
  titulo: string
  icone: IconeNome
  aside?: ReactNode
  children: ReactNode
}) {
  const id = useId()
  return (
    <Card className="!px-[22px] !py-5" role="region" aria-labelledby={id}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 id={id} className="flex items-center gap-2.5 font-bold text-[17px]">
          <Icone nome={icone} tamanho={20} />
          {titulo}
        </h2>
        {aside}
      </div>
      {children}
    </Card>
  )
}

/** Linha de seção (`setRow`): título, linha de apoio e a ação à direita. */
function Linha({
  titulo,
  sub,
  acao,
  selo,
  primeira
}: {
  titulo: string
  sub?: string
  acao?: ReactNode
  /** Selo "em breve" ao lado do título. */
  selo?: boolean
  primeira?: boolean
}) {
  return (
    <div
      className={`flex min-h-16 items-center gap-4 py-3 ${primeira ? '' : 'border-[var(--painel-line)] border-t'}`}
    >
      <div className="min-w-0 flex-1">
        <b className="flex items-center gap-2 text-[15px]">
          {titulo}
          {selo ? <EmBreve /> : null}
        </b>
        {sub ? (
          <span className="text-[13px] text-[var(--painel-muted)] leading-snug">
            {sub}
          </span>
        ) : null}
      </div>
      {acao}
    </div>
  )
}
