import {
  INVOICE_FIELDS,
  type InvoiceField,
  invoiceFieldProblem,
  normalizeInvoiceField
} from '@findsports_oficial/api/lib/invoice-details'
import { actionPhase } from '@findsports_oficial/api/lib/transient-error'
import { formatCnpj, isValidCnpj } from '@findsports_oficial/db/cnpj'
import { brasiliaDay } from '@findsports_oficial/db/event-window'
import { Skeleton } from '@findsports_oficial/ui/components/skeleton'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import {
  type ComponentProps,
  type ReactNode,
  useId,
  useRef,
  useState
} from 'react'
import { useMyBar, useMyEvents } from '@/components/admin/admin-queries'
import { AvisoVisual } from '@/components/admin/avisos'
import {
  CancelPlanDialog,
  type PerdaCancelamento
} from '@/components/billing/cancel-plan-dialog'
import { PlanChangedNotice } from '@/components/billing/plan-change'
import { ReactivateSubscriptionButton } from '@/components/billing/reactivate-subscription-button'
import {
  Badge,
  type BadgeTipo,
  Botao,
  BotaoAcao,
  CabecalhoPagina,
  Campo,
  Card,
  EmBreve,
  Icone,
  type IconeNome,
  Medalha,
  propsBotao
} from '@/components/painel'
import { getEventTemporalState } from '@/domain/events'
import { ehRascunho } from '@/domain/painel-jogos'
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
import { plural } from '@/lib/plural'
import { canCancelSubscription, getCancelNotice } from '@/lib/scheduled-cancel'
import {
  getUserFacingError,
  getUserFacingMessage
} from '@/lib/user-facing-error'
import { useTRPC } from '@/utils/trpc'

export const Route = createFileRoute('/admin/billing')({
  validateSearch: parsePlanChange,
  head: () => ({
    meta: [
      { title: 'Plano e cobrança — Onside' },
      { name: 'robots', content: 'noindex' }
    ]
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

/** Primeiro dia do mês de Brasília até hoje (`YYYY-MM-DD`). */
function thisMonth() {
  const today = brasiliaDay(new Date())
  return { from: `${today.slice(0, 8)}01`, to: today }
}

/** "Outubro 2026", no mês de Brasília. */
const mesAno = (date: string | Date) => {
  const texto = new Date(date)
    .toLocaleDateString('pt-BR', {
      month: 'long',
      year: 'numeric',
      timeZone: 'America/Sao_Paulo'
    })
    .replace(' de ', ' ')
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

/** Selo de cada fatura (3o, 3s). */
const FATURA_BADGE = {
  paid: { label: 'Pago', tipo: 'acid' },
  trial: { label: 'Teste', tipo: 'pub' },
  pending: { label: 'Pendente', tipo: 'live' }
} as const satisfies Record<string, { label: string; tipo: BadgeTipo }>

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
  // Faturas do Stripe (WEB-443), também à parte. Sem assinatura no Stripe
  // (teste do cadastro) não há fatura a buscar.
  const hasStripeSubscription = Boolean(subscription?.externalSubscriptionId)
  const invoicesQuery = useQuery({
    ...trpc.pub.getMyInvoices.queryOptions(),
    enabled: hasStripeSubscription,
    meta: { errorToast: false },
    retry: false
  })
  const invoices = invoicesQuery.data?.invoices
  const failedChargeAt = invoicesQuery.data?.lastFailedChargeAt
  // O que o plano rendeu no mês (WEB-446): só números que o servidor calcula,
  // e os que o plano não libera vêm nulos. Sem nenhum (plano parado, falha),
  // a linha some.
  const month = useQuery({
    ...trpc.commercialAnalytics.getMyMonthNumbers.queryOptions(),
    enabled: Boolean(subscription?.currentPlan),
    meta: { errorToast: false },
    retry: false
  }).data
  // Os números do design (3o, 3q) são do Elite; fora dele vêm nulos e o card
  // segue com as visitas do analytics, que todo plano enxerga.
  const elite = month?.going != null
  const overview = useQuery({
    ...trpc.commercialAnalytics.getMyAnalyticsOverview.queryOptions(
      thisMonth()
    ),
    enabled: Boolean(month) && !elite,
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
  // Pagamento pendente (3s/3t): aviso no topo, e o card diz que a cobrança
  // não foi confirmada, com a data da recusa quando o Stripe a tem.
  const pendente = lapsed === 'past_due' && planInfo !== null
  const renewal = pendente
    ? failedChargeAt
      ? `por mês · cobrança de ${diaMes(failedChargeAt)} não confirmada`
      : 'por mês · cobrança não confirmada'
    : subscription?.currentPeriodEnd && !lapsed && !ended && !cancelNotice
      ? (getTrialNotice(subscription) ??
        `por mês · renova ${diaMes(subscription.currentPeriodEnd)}`)
      : 'por mês'
  const planNote = pendente
    ? null
    : lapsed
      ? `${LAPSED_COPY[lapsed].cause} ${
          contractInPlan
            ? 'O bar sai das buscas e do mapa até um plano ser contratado.'
            : 'Recursos do plano, como o cardápio no perfil, ficam suspensos até a assinatura ser regularizada. Atualize o método de pagamento em “Gerenciar assinatura”.'
        }`
      : ended
        ? 'Assinatura encerrada: o bar fica fora das buscas e do mapa até um plano ser contratado.'
        : null

  const kpis = comPlural(
    elite
      ? [
          [month?.going, 'marcou que ia', 'marcaram que iam'],
          [month?.classicsOnTop, 'clássico no topo', 'clássicos no topo'],
          [month?.validatedCodes, 'código validado', 'códigos validados']
        ]
      : [
          [overview?.uniqueVisitors, 'viu o bar', 'viram o bar'],
          [overview?.interestedPeople, 'se interessou', 'se interessaram']
        ]
  )

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

      {pendente && planInfo ? (
        <AvisoVisual
          aviso={{
            tipo: 'pendente',
            tom: 'atencao',
            titulo: LAPSED_COPY.past_due.title(planInfo.name),
            texto: `${LAPSED_COPY.past_due.cause} Recursos do plano, como ${
              shownPlan === 'elite'
                ? 'a oferta da casa e a lista de quem vai'
                : 'o cardápio no perfil'
            }, ficam suspensos até a assinatura ser regularizada.`,
            acao: {
              rotulo: 'Atualizar pagamento',
              para: '/plan',
              variante: 'acid'
            }
          }}
          botao={
            hasProviderCustomer ? (
              <Botao
                variante="acid"
                altura={40}
                className="painel-aviso-botao"
                disabled={openingPortal}
                onClick={handleOpenPortal}
              >
                {openingPortal ? 'Abrindo portal…' : 'Atualizar pagamento'}
              </Botao>
            ) : undefined
          }
        />
      ) : null}

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
                      <dd className="font-[family-name:var(--onside-display)] text-[24px] leading-none sm:text-[30px]">
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
                      : 'Regularizar assinatura'}
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

          <Secao titulo="Faturas" icone="doc">
            {invoices?.length ? (
              <ul className="mb-3">
                {invoices.map((fatura, index) => {
                  const mes = mesAno(fatura.createdAt)
                  const badge = FATURA_BADGE[fatura.situation]
                  return (
                    <li
                      key={fatura.id}
                      className={`flex flex-wrap items-center gap-x-3.5 gap-y-2 py-3 ${index ? 'border-[var(--painel-line)] border-t' : ''}`}
                    >
                      <Icone nome="doc" tamanho={22} className="shrink-0" />
                      {/* Sem espaço (celular estreito), valor, selo e PDF
                          descem para a linha de baixo, à direita. */}
                      <div className="min-w-36 flex-1">
                        <b className="block text-[14.5px]">{mes}</b>
                        <span className="text-[12.5px] text-[var(--painel-muted)]">
                          {fatura.situation === 'trial'
                            ? fatura.trialEndsAt
                              ? `${planInfo?.name ?? 'Teste'} grátis até ${diaMes(fatura.trialEndsAt)}`
                              : 'Teste grátis'
                            : fatura.situation === 'pending'
                              ? fatura.failedAt
                                ? `Cartão recusado em ${diaMes(fatura.failedAt)}`
                                : 'Cobrança não confirmada'
                              : `Pago em ${diaMes(fatura.paidAt ?? fatura.createdAt)}`}
                        </span>
                      </div>
                      <div className="ml-auto flex shrink-0 items-center gap-3.5">
                        <span className="font-[family-name:var(--onside-mono)] font-semibold text-[14px] leading-none">
                          {/* "R$ 269" como no design; centavos só quando há. */}
                          {Number.isInteger(fatura.amountReais)
                            ? formatPlanPrice(fatura.amountReais)
                            : reais(fatura.amountReais)}
                        </span>
                        <Badge tipo={badge.tipo}>{badge.label}</Badge>
                        <span className="w-[72px] text-right">
                          {/* O teste de R$ 0 não tem o que baixar (3o). */}
                          {fatura.pdfUrl && fatura.situation !== 'trial' ? (
                            <a
                              href={fatura.pdfUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              aria-label={`Baixar PDF da fatura de ${mes}`}
                              className="font-bold text-[13.5px]"
                            >
                              Baixar PDF
                            </a>
                          ) : null}
                        </span>
                      </div>
                    </li>
                  )
                })}
              </ul>
            ) : hasStripeSubscription && invoicesQuery.isLoading ? (
              <div className="flex flex-col gap-2 py-3" aria-busy="true">
                <span className="sr-only">Carregando faturas…</span>
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : (
              <p className="py-3 text-[13.5px] text-[var(--painel-muted)] leading-normal">
                {!hasStripeSubscription
                  ? 'Nenhum pagamento registrado ainda.'
                  : invoicesQuery.data
                    ? 'Nenhuma fatura emitida ainda.'
                    : 'Não foi possível carregar as faturas agora. Elas também ficam no portal da Stripe.'}
              </p>
            )}
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

          <DadosDaNota />

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
          going={month?.going ?? null}
          visitors={elite ? null : (overview?.uniqueVisitors ?? null)}
          classics={month?.classicsOnTop ?? null}
          onClose={() => setCancelling(false)}
        />
      ) : null}
    </>
  )
}

/**
 * O que o bar perde, com os números que existem (3q): quem marcou que ia no
 * mês e os clássicos no topo (Elite), senão quem viu o bar, os jogos marcados
 * e o pin.
 */
function CancelPlan({
  going,
  visitors,
  classics,
  ...props
}: Omit<Parameters<typeof CancelPlanDialog>[0], 'perdas'> & {
  going: number | null
  visitors: number | null
  classics: number | null
}) {
  const events = useMyEvents().data
  // Rascunho (WEB-436) não está nas buscas: não sai delas.
  const upcoming = events?.filter(
    (item) =>
      !ehRascunho(item) &&
      getEventTemporalState(item.startsAt, item.endsAt) !== 'past'
  ).length
  const perdas: PerdaCancelamento[] = comPlural([
    [
      going,
      'pessoa que marcou que ia ao bar este mês',
      'pessoas que marcaram que iam ao bar este mês'
    ],
    [
      visitors,
      'pessoa que viu o bar este mês',
      'pessoas que viram o bar este mês'
    ],
    [
      classics,
      'clássico com o bar no topo da busca',
      'clássicos com o bar no topo da busca'
    ],
    [
      upcoming || null,
      'jogo marcado sai das buscas',
      'jogos marcados saem das buscas'
    ],
    [props.plan === 'elite' ? 1 : null, 'pin exclusivo no mapa', '']
  ])
  return <CancelPlanDialog {...props} perdas={perdas} />
}

/**
 * Números com rótulo no singular ou no plural ("1 código validado"); o que
 * vem nulo (o plano não libera, sem dado) sai da lista.
 */
function comPlural(
  linhas: [valor: number | null | undefined, um: string, varios: string][]
) {
  return linhas.flatMap(([valor, um, varios]) =>
    valor == null ? [] : [{ valor, rotulo: plural(valor, um, varios) }]
  )
}

/** Cada linha de "Dados da nota" (3o) e o campo que o "Editar" abre. */
const NOTA = {
  legalName: {
    titulo: 'Razão social',
    campo: { autoComplete: 'organization', maxLength: 150 }
  },
  cnpj: {
    titulo: 'CNPJ',
    campo: {
      autoComplete: 'off',
      autoCapitalize: 'characters',
      spellCheck: false,
      maxLength: 18,
      placeholder: '00.000.000/0000-00'
    }
  },
  invoiceEmail: {
    titulo: 'E-mail para notas',
    campo: {
      type: 'email',
      autoComplete: 'email',
      spellCheck: false,
      maxLength: 254,
      dica: 'Sem ele, as faturas vão para o e-mail de acesso.'
    }
  }
} satisfies Record<
  InvoiceField,
  { titulo: string; campo: ComponentProps<typeof Campo> }
>

const notaVisivel = (campo: InvoiceField, valor: string) =>
  campo === 'cnpj' ? formatCnpj(valor) : valor

/**
 * Dados da nota (3o, WEB-444): razão social, CNPJ e e-mail para notas, cada
 * um com o seu "Editar", que troca a linha pelo campo, como em Configurações.
 * O servidor manda os três ao cliente do Stripe antes de gravar.
 */
function DadosDaNota() {
  const bar = useMyBar().data
  const [editando, setEditando] = useState<InvoiceField | null>(null)
  // Fechado o campo, o foco volta ao "Editar" da mesma linha.
  const voltarFoco = useRef<InvoiceField | null>(null)
  const fechar = () => {
    voltarFoco.current = editando
    setEditando(null)
  }
  return (
    <Secao titulo="Dados da nota" icone="doc">
      {INVOICE_FIELDS.map((campo, index) => {
        const { titulo } = NOTA[campo]
        const valor = bar?.[campo] ?? null
        return editando === campo ? (
          <EditarNota
            key={campo}
            campo={campo}
            inicial={valor ? notaVisivel(campo, valor) : ''}
            primeira={index === 0}
            onFechar={fechar}
          />
        ) : (
          <Linha
            key={campo}
            titulo={titulo}
            sub={
              bar
                ? valor
                  ? notaVisivel(campo, valor)
                  : 'Não informado'
                : undefined
            }
            primeira={index === 0}
            acao={
              <button
                type="button"
                ref={(el) => {
                  if (el && voltarFoco.current === campo) {
                    voltarFoco.current = null
                    el.focus()
                  }
                }}
                disabled={!bar}
                aria-label={`Editar ${titulo}`}
                onClick={() => setEditando(campo)}
                className="font-bold text-[13.5px] underline-offset-2 hover:underline disabled:opacity-50"
              >
                Editar
              </button>
            }
          />
        )
      })}
    </Secao>
  )
}

function EditarNota({
  campo,
  inicial,
  primeira,
  onFechar
}: {
  campo: InvoiceField
  inicial: string
  primeira: boolean
  onFechar: () => void
}) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [valor, setValor] = useState(inicial)
  const [erro, setErro] = useState<string | null>(null)
  const salvar = useMutation(
    trpc.pub.updateInvoiceDetails.mutationOptions({
      onSuccess: (dados) => {
        queryClient.setQueryData(trpc.pub.getMe.queryKey(), (bar) =>
          bar ? { ...bar, ...dados } : bar
        )
        // O "Salvo" fica à vista um instante antes de a linha voltar.
        setTimeout(onFechar, 900)
      },
      // Recusa da API (CNPJ que o Stripe não aceitou) vem com a frase dela;
      // o resto, passageiro, fica com o "Tentar de novo" do botão.
      onError: (error) =>
        setErro(
          error.data?.httpStatus === 400
            ? error.message
            : getUserFacingMessage(error, 'Não foi possível salvar.')
        )
    })
  )
  const { titulo, campo: props } = NOTA[campo]
  const { dica, ...input } = props as ComponentProps<typeof Campo>

  return (
    <form
      method="post"
      noValidate
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !salvar.isPending) onFechar()
      }}
      className={`flex flex-col gap-3 py-3 ${primeira ? '' : 'border-[var(--painel-line)] border-t'}`}
      onSubmit={(e) => {
        e.preventDefault()
        const normalizado = normalizeInvoiceField(campo, valor)
        const problema = invoiceFieldProblem(campo, normalizado)
        setErro(problema)
        if (!problema) salvar.mutate({ [campo]: normalizado })
      }}
    >
      <Campo
        {...input}
        className="w-full"
        rotulo={titulo}
        autoFocus
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        onBlur={() => {
          if (campo === 'cnpj' && isValidCnpj(valor))
            setValor(formatCnpj(valor))
        }}
        aria-invalid={erro ? true : undefined}
        dica={
          erro ? (
            <span role="alert" className="text-[var(--painel-live)]">
              {erro}
            </span>
          ) : (
            dica
          )
        }
      />
      {/* No celular estreito o "Salvar" desce para baixo do "Cancelar". */}
      <div className="flex flex-wrap gap-2">
        <Botao altura={38} disabled={salvar.isPending} onClick={onFechar}>
          Cancelar
        </Botao>
        <BotaoAcao
          type="submit"
          variante="ink"
          altura={38}
          fase={actionPhase([salvar], { done: salvar.isSuccess })}
          rotulos={{ idle: 'Salvar', sending: 'Salvando…', done: 'Salvo' }}
        />
      </div>
    </form>
  )
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
          <span className="block text-[13px] text-[var(--painel-muted)] leading-snug [overflow-wrap:anywhere]">
            {sub}
          </span>
        ) : null}
      </div>
      {acao}
    </div>
  )
}
