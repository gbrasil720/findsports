import type { SubscriptionPlan } from '@findsports_oficial/db'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { toast } from 'sonner'
import { PlanChangedNotice } from '@/components/billing/plan-change'
import { ReactivateSubscriptionButton } from '@/components/billing/reactivate-subscription-button'
import { Check } from '@/components/landing/v3/icons'
import { PLAN_ART } from '@/components/onboarding/pub-plan-step'
import { useFounderCoupon } from '@/hooks/use-founder-coupon'
import { useSession } from '@/hooks/use-session'
import { analytics } from '@/lib/analytics'
import { openBillingPortal } from '@/lib/billing-client'
import { isLapsed, LAPSED_COPY } from '@/lib/lapsed-plan'
import {
  CONTRACTED_TRIAL_LABEL,
  formatPlanPrice,
  getPlan,
  getPlanPageMode,
  getTrialNotice,
  isContractedTrial,
  PLAN_CATALOG,
  planChargeForCurrentPlan,
  planChargeForShowcase,
  TRIAL_NO_CARD_NOTE
} from '@/lib/plan-catalog'
import { canCancelSubscription, getCancelNotice } from '@/lib/scheduled-cancel'
import { getUserFacingError } from '@/lib/user-facing-error'
import { useTRPC } from '@/utils/trpc'
import { CancelarPlano } from './cancelar-plano'
import { DadosDaNota } from './dados-da-nota'

/*
 * "Plano e cobrança" do painel novo (WEB-501, fase 4; protótipo `plano`):
 * o plano em destaque, os três planos (a troca é em `/plan`), pagamento,
 * dados da nota, faturas e contato. É também o `returnUrl` do checkout e do
 * portal do Stripe (`lib/billing-client.ts`), e lê `planFrom`/`planTo` da
 * troca pedida em `/plan` (WEB-351).
 */

const SUPPORT_EMAIL = 'contato@onside.sh'

/** Por `status`, mais `trial_ended`, que o servidor distingue de `trialing`. */
const STATUS_LABEL: Record<string, { label: string; tone?: 'ok' | 'bad' }> = {
  active: { label: 'Ativo', tone: 'ok' },
  trialing: { label: 'Teste grátis' },
  // Teste que já é do Stripe: contratou antes do fim (WEB-347).
  contracted_trial: { label: CONTRACTED_TRIAL_LABEL, tone: 'ok' },
  past_due: { label: LAPSED_COPY.past_due.label, tone: 'bad' },
  trial_ended: { label: LAPSED_COPY.trial_ended.label, tone: 'bad' },
  inactive: { label: 'Inativo', tone: 'bad' },
  cancelled: { label: 'Cancelado' }
}

function formatDate(date: string | Date | null): string {
  if (!date) return '—'
  return new Date(date).toLocaleDateString('pt-BR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  })
}

const reais = (value: number) =>
  value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export function PlanoPage({
  pending
}: {
  pending: { from: SubscriptionPlan; to: SubscriptionPlan } | null
}) {
  const trpc = useTRPC()
  const session = useSession()
  const [openingPortal, setOpeningPortal] = useState(false)
  const [portalError, setPortalError] = useState<string | null>(null)

  // A seção desenha o próprio erro; o toast global repetiria a falha.
  const subscriptionQuery = useQuery({
    ...trpc.pub.getMySubscription.queryOptions(),
    meta: { errorToast: false }
  })
  const subscription = subscriptionQuery.data
  // Crédito, próxima cobrança e cartão, lidos do Stripe (WEB-350). Enquanto
  // carrega, ou se o Stripe falhar, a tela segue sem eles.
  const balance = useQuery({
    ...trpc.pub.getMyBillingBalance.queryOptions(),
    enabled: Boolean(subscription?.externalSubscriptionId),
    meta: { errorToast: false },
    retry: false
  }).data

  // Sem cliente no Stripe não há portal: é o bar no teste do cadastro, que
  // nunca passou pelo checkout (WEB-264). O id da assinatura cobre a sessão
  // em cache de quem acabou de pagar.
  // Pix Automático (AbacatePay): sem portal; o banco debita e o painel cancela.
  const onPix = subscription?.provider === 'abacatepay'
  const pixAvailable = useQuery({
    ...trpc.pub.getPaymentMethods.queryOptions(),
    meta: { errorToast: false }
  }).data?.pix
  const hasProviderCustomer = Boolean(
    session?.user.stripeCustomerId ||
      (subscription?.provider === 'stripe' &&
        subscription.externalSubscriptionId)
  )
  const subscriptionError = subscriptionQuery.error
    ? getUserFacingError(
        subscriptionQuery.error,
        'Não foi possível carregar a assinatura. Tente novamente.'
      )
    : null

  const openPortal = async () => {
    setOpeningPortal(true)
    setPortalError(null)
    try {
      // Com URL na resposta o cliente do better-auth já está navegando.
      if (await openBillingPortal()) return
      setPortalError('Não foi possível abrir o portal. Tente novamente.')
    } catch {
      setPortalError('Não foi possível abrir o portal. Tente novamente.')
    } finally {
      setOpeningPortal(false)
    }
  }

  const plan = subscription?.currentPlan
  // Plano parado continua sendo o plano do bar: aqui o dono regulariza (WEB-141).
  const standing = subscription?.standing
  const lapsed = isLapsed(standing) ? standing : null
  // Teste vencido sem assinatura no provedor: o caminho é `/plan` (WEB-249).
  const mode = getPlanPageMode(subscription)
  const contractInPlan = lapsed !== null && mode === 'checkout'
  // Teste grátis do cadastro: nada a gerenciar no Stripe ainda (WEB-31).
  const onLocalTrial = mode === 'trial'
  // Assinatura encerrada mostra o plano contratado com o selo (WEB-60).
  const ended = standing === 'ended'
  const shownPlan = plan ?? (lapsed || ended ? subscription?.plan : null)
  const planInfo = shownPlan ? getPlan(shownPlan) : null
  const founderCouponAvailable = useFounderCoupon()
  const charge =
    planInfo && subscription
      ? planChargeForCurrentPlan(planInfo, subscription, founderCouponAvailable)
      : null
  const status =
    STATUS_LABEL[
      isContractedTrial(subscription)
        ? 'contracted_trial'
        : standing === 'trial_ended'
          ? standing
          : (subscription?.status ?? '')
    ]
  const cancelNotice = getCancelNotice(subscription)
  const canCancel = canCancelSubscription(subscription)
  // Pix escolhido no teste do cadastro, ainda sem autorização: no teste e
  // depois dele (o bar fora do ar volta ao autorizar).
  const pixWaiting = Boolean(
    pixAvailable &&
      subscription?.pixAfterTrialAt &&
      subscription.status === 'trialing' &&
      !subscription.externalSubscriptionId
  )
  const authorizePix = useMutation(
    trpc.pub.startPixCheckout.mutationOptions({
      onSuccess: ({ url }) => {
        window.location.href = url
      },
      onError: (pixError) =>
        toast.error(
          pixError.message ||
            'Não foi possível abrir o Pix agora. Tente de novo.'
        )
    })
  )
  const trialOver = standing === 'trial_ended'

  const notice =
    pixWaiting && subscription ? (
      <p className={trialOver ? 'pn-ph-bad' : undefined}>
        {trialOver
          ? 'O teste grátis acabou e o bar saiu das buscas e do mapa. Autorize o Pix para voltar ao ar na hora.'
          : `Você escolheu pagar com Pix no fim do teste. Autorize até ${subscription.currentPeriodEnd ? formatDate(subscription.currentPeriodEnd) : 'o fim do teste'} para o bar seguir no ar: o primeiro débito sai quando você autorizar, e o teste acaba aí. A gente lembra por e-mail 3 dias antes e no último dia.`}
      </p>
    ) : lapsed ? (
      <p className="pn-ph-bad">
        {LAPSED_COPY[lapsed].cause}{' '}
        {contractInPlan
          ? 'O bar sai das buscas e do mapa até um plano ser contratado.'
          : onPix
            ? 'O débito do Pix Automático não passou. A AbacatePay tenta de novo nos próximos dias: deixe saldo na conta que autorizou. Recursos do plano, como o cardápio no perfil, ficam suspensos até o débito passar.'
            : 'Recursos do plano, como o cardápio no perfil, ficam suspensos até a assinatura ser regularizada. Atualize o método de pagamento em “Gerenciar assinatura”.'}
      </p>
    ) : ended ? (
      <p className="pn-ph-bad">
        Assinatura encerrada: o bar fica fora das buscas e do mapa até um plano
        ser contratado.
      </p>
    ) : cancelNotice && onPix ? (
      <p>
        {cancelNotice}. A autorização do Pix já acabou no banco: para continuar,{' '}
        <Link
          to="/plan"
          search={{ origin: 'billing' }}
          className="pn-lnk-b pn-u"
        >
          contrate de novo
        </Link>
        .
      </p>
    ) : cancelNotice ? (
      <p>
        {cancelNotice}.{' '}
        <ReactivateSubscriptionButton className="pn-lnk-b pn-u" />
      </p>
    ) : onPix && subscription?.currentPeriodEnd ? (
      <p>
        Pix Automático: próximo débito em{' '}
        {formatDate(subscription.currentPeriodEnd)}, direto no seu banco.
      </p>
    ) : subscription?.currentPeriodEnd ? (
      <p>
        {getTrialNotice(subscription) ??
          `Próxima cobrança em ${formatDate(subscription.currentPeriodEnd)}`}
      </p>
    ) : null

  return (
    <>
      <div className="pn-head">
        <div>
          <p className="pn-k">Assinatura e pagamentos</p>
          <h1 className="pn-disp">Plano e cobrança</h1>
        </div>
        <div className="pn-acts">
          <Link
            to="/plan"
            search={{ origin: 'billing' }}
            className="pn-btn pn-ghost pn-sm"
          >
            Ver todos os planos
          </Link>
        </div>
      </div>

      <PlanChangedNotice pending={pending} />

      <section className="pn-planhero" aria-label="Seu plano">
        {subscriptionQuery.isLoading ? (
          <div className="pn-ph-l" role="status" aria-busy="true">
            <span className="sr-only">Carregando assinatura…</span>
            <i className="pn-ph-skel" />
          </div>
        ) : subscriptionQuery.isError ? (
          <div className="pn-ph-l" role="alert">
            <p>{subscriptionError?.message}</p>
            {subscriptionError?.retryable ? (
              <button
                type="button"
                className="pn-btn pn-acid pn-sm"
                onClick={() => void subscriptionQuery.refetch()}
              >
                Tentar de novo
              </button>
            ) : null}
          </div>
        ) : planInfo ? (
          <>
            <div className="pn-ph-l">
              <div className="pn-ph-top">
                <span className={`pn-md is-${planInfo.id}`}>
                  {/* biome-ignore lint/performance/noImgElement: ilustração estática do plano, de public/. */}
                  <img src={PLAN_ART[planInfo.id]} alt="" width="46" />
                </span>
                <span
                  className={`pn-badge pn-ph-st${status?.tone === 'ok' ? ' is-pub' : status?.tone === 'bad' ? ' is-bad' : ''}`}
                >
                  {status?.label ?? 'Status desconhecido'}
                </span>
              </div>
              <h2 className="pn-disp">{planInfo.name}</h2>
              {charge ? (
                <div className="pn-price">
                  {charge.listReais != null ? (
                    <s>
                      {formatPlanPrice(charge.listReais)}
                      {planInfo.period}
                    </s>
                  ) : null}
                  <b>{formatPlanPrice(charge.chargeReais)}</b>
                  <span>por mês</span>
                </div>
              ) : (
                <div className="pn-price" aria-busy="true">
                  <span>Carregando preço…</span>
                </div>
              )}
              {charge?.listReais != null ? (
                <span className="pn-fund">PREÇO DE FUNDADOR</span>
              ) : null}
              {charge?.hint ? (
                <p className="pn-ph-hint">{charge.hint}</p>
              ) : null}
              <div className="pn-ph-note">{notice}</div>
              {balance &&
              (balance.nextChargeReais !== null ||
                balance.creditReais !== null ||
                balance.card) ? (
                <div className="pn-ph-bal">
                  {balance.nextChargeReais !== null ? (
                    <p>
                      Valor da próxima cobrança:{' '}
                      <b>{reais(balance.nextChargeReais)}</b>
                    </p>
                  ) : null}
                  {balance.creditReais !== null ? (
                    <p>
                      Você tem <b>{reais(balance.creditReais)}</b> de crédito;
                      as próximas cobranças serão descontadas dele.
                    </p>
                  ) : null}
                  {balance.card ? (
                    <p>Cartão •••• {balance.card.last4} salvo</p>
                  ) : null}
                </div>
              ) : null}

              <div className="pn-acts pn-ph-acts">
                {pixWaiting && subscription ? (
                  <>
                    <button
                      type="button"
                      className="pn-btn pn-acid"
                      disabled={
                        authorizePix.isPending || authorizePix.isSuccess
                      }
                      onClick={() =>
                        authorizePix.mutate({ plan: subscription.plan })
                      }
                    >
                      {authorizePix.isPending || authorizePix.isSuccess
                        ? 'Abrindo…'
                        : 'Autorizar o Pix'}
                    </button>
                    <Link
                      to="/plan"
                      search={{ origin: 'billing' }}
                      className="pn-btn pn-ghost"
                    >
                      Trocar de plano
                    </Link>
                  </>
                ) : null}
                {contractInPlan && !pixWaiting ? (
                  <Link
                    to="/plan"
                    search={{ origin: 'billing' }}
                    className="pn-btn pn-acid"
                  >
                    Continuar no {planInfo.name}
                  </Link>
                ) : null}
                {(onLocalTrial || ended) && !pixWaiting ? (
                  <Link
                    to="/plan"
                    search={{ origin: 'billing' }}
                    className="pn-btn pn-acid"
                  >
                    Contratar plano
                  </Link>
                ) : null}
                {plan && plan !== 'elite' && !pixWaiting ? (
                  <Link
                    to="/plan"
                    search={{ origin: 'billing' }}
                    onClick={() =>
                      analytics.upgradeClicked(
                        plan,
                        plan === 'starter' ? 'pro' : 'elite'
                      )
                    }
                    className={`pn-btn ${onLocalTrial || contractInPlan ? 'pn-ghost' : 'pn-acid'}`}
                  >
                    Fazer upgrade
                  </Link>
                ) : null}
                {hasProviderCustomer ? (
                  <button
                    type="button"
                    onClick={() => void openPortal()}
                    disabled={openingPortal}
                    className="pn-btn pn-ghost"
                  >
                    {openingPortal ? 'Abrindo portal…' : 'Gerenciar assinatura'}
                  </button>
                ) : null}
                {/* Ação secundária, sem cara de botão (WEB-339). */}
                {canCancel ? (
                  <CancelarPlano
                    planName={planInfo.name}
                    until={
                      subscription?.currentPeriodEnd
                        ? new Date(subscription.currentPeriodEnd)
                        : null
                    }
                    className="pn-lnk-b pn-u pn-ph-cancel"
                    pix={onPix}
                  />
                ) : null}
              </div>
              {portalError ? (
                <p className="pn-ph-bad" role="alert">
                  {portalError}
                </p>
              ) : null}
              <p className="pn-ph-foot">
                {pixWaiting
                  ? 'Prefere o cartão? Em “Ver todos os planos”, contrate no cartão: a primeira cobrança só sai quando o teste acabar.'
                  : onPix && canCancel
                    ? 'Para trocar de plano, autorize o Pix do novo plano em “Ver todos os planos”: o débito dele sai na hora e o Pix atual é cancelado sozinho. “Cancelar assinatura” encerra a autorização no banco, e o plano segue até o fim do mês pago.'
                    : ended && hasProviderCustomer
                      ? 'As faturas e os recibos da assinatura encerrada continuam no portal de gerenciamento.'
                      : canCancel
                        ? 'Para trocar de plano ou atualizar o método de pagamento, use o portal de gerenciamento. “Cancelar assinatura” pergunta o motivo e abre o portal direto no cancelamento.'
                        : hasProviderCustomer
                          ? 'Para cancelar, trocar de plano ou atualizar o método de pagamento, use o portal de gerenciamento.'
                          : onLocalTrial
                            ? `${TRIAL_NO_CARD_NOTE} Contratando antes do fim, a primeira cobrança só sai quando o teste acabar.`
                            : 'Cancelamento, troca de plano e método de pagamento ficam aqui depois da contratação.'}
              </p>
            </div>
            <div className="pn-ph-r">
              <span className="pn-cd">
                O QUE O {planInfo.name.toUpperCase()} TEM
              </span>
              <ul>
                {planInfo.features.map((f) => (
                  <li key={f}>
                    <Check size={16} />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          </>
        ) : (
          <div className="pn-ph-l">
            <h2 className="pn-disp">Sem plano</h2>
            <p className="pn-ph-note">Nenhuma assinatura ativa encontrada.</p>
            <div className="pn-acts pn-ph-acts">
              <Link
                to="/plan"
                search={{ origin: 'billing' }}
                className="pn-btn pn-acid"
              >
                Ver os planos
              </Link>
            </div>
          </div>
        )}
      </section>

      <section aria-labelledby="pn-os-planos">
        <div className="pn-chd pn-planos-h">
          <h3 id="pn-os-planos">Os planos</h3>
          <small>troque quando quiser</small>
        </div>
        <ul className="pn-plans">
          {PLAN_CATALOG.map((info) => {
            const own = info.id === shownPlan
            const showcase = planChargeForShowcase(info, founderCouponAvailable)
            return (
              <li key={info.id} className={`pn-pl${own ? ' is-cur' : ''}`}>
                {own ? <span className="pn-tagc">SEU PLANO</span> : null}
                <span className={`pn-md is-${info.id}`}>
                  {/* biome-ignore lint/performance/noImgElement: ilustração estática do plano, de public/. */}
                  <img src={PLAN_ART[info.id]} alt="" width="40" />
                </span>
                <h4 className="pn-disp">{info.name}</h4>
                <p>{info.tagline}</p>
                {/* O preço como nos cartões de /plan: grande, com a tabela
                    cheia riscada quem ainda contrata pelo checkout. */}
                <div className="pn-pl-price">
                  <span className="pn-pl-k">
                    {showcase?.listReais ? 'Preço de fundador' : 'Por mês'}
                  </span>
                  {showcase ? (
                    <span className="pn-pl-pv">
                      <b>{formatPlanPrice(showcase.chargeReais)}</b>
                      <span>{info.period}</span>
                      {showcase.listReais &&
                      !subscription?.externalSubscriptionId ? (
                        <s>{formatPlanPrice(showcase.listReais)}</s>
                      ) : null}
                    </span>
                  ) : (
                    <span
                      className="pn-pl-pv is-load"
                      role="status"
                      aria-label="Carregando preço"
                    />
                  )}
                </div>
                {own ? null : (
                  <Link
                    to="/plan"
                    search={{ origin: 'billing' }}
                    className="pn-btn pn-ghost pn-sm"
                  >
                    {/* Sem assinatura no Stripe não há o que mudar: contrata. */}
                    {plan &&
                    subscription?.externalSubscriptionId &&
                    !subscription.cancelAt
                      ? 'Mudar para'
                      : 'Contratar'}{' '}
                    {info.name}
                  </Link>
                )}
              </li>
            )
          })}
        </ul>
      </section>

      <div className="pn-duo">
        <section className="pn-card" aria-labelledby="pn-pag">
          <div className="pn-chd">
            <h3 id="pn-pag">Pagamento</h3>
          </div>
          <div className="pn-lines">
            <div className="pn-ln">
              <span>
                <b>Cartão</b>
                <span>
                  {balance?.card
                    ? `Final ${balance.card.last4}, no portal do Stripe`
                    : hasProviderCustomer
                      ? 'O cartão da assinatura fica no portal do Stripe'
                      : 'Pedido no checkout, quando você contratar'}
                </span>
              </span>
              {hasProviderCustomer ? (
                <button
                  type="button"
                  className="pn-btn pn-ghost pn-sm"
                  disabled={openingPortal}
                  onClick={() => void openPortal()}
                >
                  Atualizar
                </button>
              ) : (
                <span />
              )}
            </div>
            <div className="pn-ln">
              {onPix && !ended ? (
                <>
                  <span>
                    <b>
                      Pix Automático{' '}
                      <span className="pn-badge is-pub">
                        {subscription?.cancelAt ? 'CANCELADO' : 'EM USO'}
                      </span>
                    </b>
                    <span>
                      {subscription?.cancelAt
                        ? 'Autorização encerrada no banco. Não sai mais débito.'
                        : charge
                          ? `${formatPlanPrice(charge.chargeReais)} por mês, debitado do seu banco`
                          : 'Débito mensal, autorizado no seu banco'}
                    </span>
                  </span>
                  <span />
                </>
              ) : pixWaiting ? (
                <>
                  <span>
                    <b>
                      Pix Automático{' '}
                      <span className="pn-badge is-pub">ESCOLHIDO</span>
                    </b>
                    <span>Falta autorizar no app do banco.</span>
                  </span>
                  <span />
                </>
              ) : pixAvailable ? (
                <>
                  <span>
                    <b>Pix Automático</b>
                    <span>
                      Autorize uma vez no app do banco e o débito sai todo mês.
                      {onLocalTrial
                        ? ' No teste grátis, a autorização fica para o fim dele.'
                        : ' O primeiro débito sai na autorização.'}
                    </span>
                  </span>
                  <Link
                    to="/plan"
                    search={{ origin: 'billing' }}
                    className="pn-btn pn-ghost pn-sm"
                  >
                    Pagar com Pix
                  </Link>
                </>
              ) : (
                <>
                  <span>
                    <b>
                      Pix <span className="pn-badge">EM BREVE</span>
                    </b>
                    <span>Pagar a mensalidade por Pix</span>
                  </span>
                  <span />
                </>
              )}
            </div>
          </div>
        </section>

        <DadosDaNota />
      </div>

      <div className="pn-duo">
        <section className="pn-card" aria-labelledby="pn-fat">
          <div className="pn-chd">
            <h3 id="pn-fat">Faturas</h3>
          </div>
          <p className="pn-note">
            {onPix
              ? 'Cada débito do Pix Automático aparece no extrato do seu banco, e o comprovante chega por e-mail.'
              : hasProviderCustomer
                ? 'As faturas e os recibos de cada cobrança ficam no portal, em “Gerenciar assinatura”. O recibo também chega por e-mail a cada pagamento.'
                : 'Nenhum pagamento registrado ainda.'}
          </p>
          {hasProviderCustomer ? (
            <button
              type="button"
              className="pn-go pn-lnk-b"
              disabled={openingPortal}
              onClick={() => void openPortal()}
            >
              Ver faturas no portal
            </button>
          ) : null}
        </section>

        <section className="pn-card" aria-labelledby="pn-duv">
          <div className="pn-chd">
            <h3 id="pn-duv">Dúvidas sobre cobrança</h3>
          </div>
          <div className="pn-lines">
            <div className="pn-ln">
              <span>
                <b>Fale com a gente</b>
                <span className="pn-mono">{SUPPORT_EMAIL}</span>
              </span>
              <button
                type="button"
                className="pn-btn pn-ghost pn-sm"
                onClick={() => {
                  navigator.clipboard.writeText(SUPPORT_EMAIL).then(
                    () => toast.success('E-mail copiado.'),
                    () => toast(SUPPORT_EMAIL)
                  )
                }}
              >
                Copiar e-mail
              </button>
            </div>
          </div>
        </section>
      </div>
    </>
  )
}
