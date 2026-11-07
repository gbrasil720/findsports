import {
  ONBOARDING_TRIAL,
  STARTER_EVENT_LIMIT
} from '@findsports_oficial/api/lib/plan-limits'
import { paybackClients } from '@findsports_oficial/api/lib/pub-routine'
import type { SubscriptionPlan } from '@findsports_oficial/db'
import type { ReactNode } from 'react'
import { Check } from '@/components/landing/v3/icons'
import {
  formatPlanPrice,
  PLAN_CATALOG,
  planChargeForShowcase
} from '@/lib/plan-catalog'

/** As ilustrações dos planos: chama, estrela e coroa. */
export const PLAN_ART: Record<SubscriptionPlan, string> = {
  starter: '/chama.svg',
  pro: '/estrela.svg',
  elite: '/coroa.svg'
}

/**
 * O que cada cartão lista, em quatro ou cinco linhas: tudo está no catálogo
 * (`plan-catalog.ts`), com o nome curto do design.
 */
const CARD_FEATURES: Record<SubscriptionPlan, string[]> = {
  starter: [
    'Perfil completo com agenda e rota',
    'Contato direto por WhatsApp',
    `Até ${STARTER_EVENT_LIMIT} jogos por mês`,
    'Desempenho dos últimos 30 dias'
  ],
  pro: [
    'Tudo do Starter',
    'Jogos ilimitados na agenda',
    'Destaque na busca por time e liga',
    'Link do cardápio e preço médio no perfil',
    'Funil de rota, telefone e WhatsApp'
  ],
  elite: [
    'Tudo do Pro',
    'Topo da busca nos clássicos',
    'Quem vai assistir, jogo a jogo',
    'Oferta da casa e código do balcão',
    'Histórico completo'
  ]
}

/**
 * "Plano do teste" (WEB-501; protótipo `planoOb`): depois do primeiro jogo e
 * antes do painel, a recomendação da rotina, os motivos e os três planos lado
 * a lado, com o recomendado escuro e já marcado. O teste vale para qualquer
 * um (WEB-358) e a data de fim não muda com a escolha.
 */
export function PubPlanStep({
  barName,
  recommended,
  reasons,
  selected,
  onSelect,
  spend,
  founderCoupon,
  onEditRoutine,
  trialEnd,
  heading
}: {
  barName: string
  recommended: SubscriptionPlan
  reasons: string[]
  selected: SubscriptionPlan
  onSelect: (plan: SubscriptionPlan) => void
  spend: number
  founderCoupon: boolean
  onEditRoutine: () => void
  /** "5 fev": o fim do teste, como o servidor gravou. */
  trialEnd: string | null
  /** O título do passo, com o foco de quem troca de passo. */
  heading: (content: ReactNode) => ReactNode
}) {
  const recName = PLAN_CATALOG.find((p) => p.id === recommended)?.name
  return (
    <>
      <span className="ob-k">Nossa recomendação, pela sua rotina</span>
      {heading(
        <>
          O <span className="hl">{recName}</span> é o plano do{' '}
          {barName.trim() || 'seu bar'}
        </>
      )}
      <p className="ob-sub">
        Escolha o plano do teste para entrar no painel. Vale o que você
        escolher: qualquer plano é grátis, sem cartão, por{' '}
        {ONBOARDING_TRIAL.days} dias contados desde que o bar foi ao ar
        {trialEnd ? ` (até ${trialEnd})` : ''}. Durante o teste, dá para trocar
        de plano quando quiser, e a data de fim não muda.
      </p>
      <div className="ob-rbox">
        <span className="ob-k">Pelo que você contou</span>
        <ul>
          {reasons.map((reason) => (
            <li key={reason}>
              <Check size={16} />
              {reason}
            </li>
          ))}
        </ul>
        <button type="button" className="ob-link" onClick={onEditRoutine}>
          Mudar minhas respostas
        </button>
      </div>

      <fieldset className="ob-pgrid">
        <legend className="sr-only">Plano do teste grátis</legend>
        {PLAN_CATALOG.map((plan) => {
          const charge = planChargeForShowcase(plan, founderCoupon)
          const clients = paybackClients(charge.chargeReais, spend)
          const isRec = plan.id === recommended
          const on = plan.id === selected
          return (
            <label key={plan.id} className={`ob-pc${isRec ? ' rec' : ''}`}>
              <input
                type="radio"
                name="plano"
                value={plan.id}
                checked={on}
                onChange={() => onSelect(plan.id)}
                aria-label={plan.name}
              />
              {isRec ? <span className="tagc">RECOMENDADO</span> : null}
              <span className="ic" aria-hidden="true">
                {/* biome-ignore lint/performance/noImgElement: ilustração estática do plano, de public/, com width e height. */}
                <img src={PLAN_ART[plan.id]} alt="" width="52" height="52" />
              </span>
              <h3>{plan.name}</h3>
              <p className="pd">{plan.tagline}</p>
              <span className="ob-pcp">
                <span className="ob-k">
                  {ONBOARDING_TRIAL.days} dias grátis, depois
                </span>
                <span className="ob-pcv">
                  <b>{formatPlanPrice(charge.chargeReais)}</b>
                  <span>{plan.period}</span>
                  {charge.listReais ? (
                    <s>{formatPlanPrice(charge.listReais)}</s>
                  ) : null}
                </span>
                <small>
                  {charge.listReais ? 'Preço de fundador. ' : ''}Só cobra se
                  você contratar.
                </small>
              </span>
              <ul className="ob-pcf">
                {CARD_FEATURES[plan.id].map((feature) => (
                  <li key={feature}>
                    <Check size={15} />
                    {feature}
                  </li>
                ))}
              </ul>
              <span className="ob-pcb">
                <b>
                  {clients === 1
                    ? '1 cliente a mais por mês já paga o plano'
                    : `${clients} clientes a mais por mês já pagam o plano`}
                </b>
                <small>
                  {formatPlanPrice(charge.chargeReais)} ÷ R$ {spend} que cada um
                  gasta
                </small>
              </span>
              <span className="ob-pcsel">
                <i aria-hidden="true" />
                {on ? 'Escolhido' : `Escolher o ${plan.name}`}
              </span>
            </label>
          )
        })}
      </fieldset>
      <p className="ob-note">
        A conta de clientes usa o gasto que você informou; não é previsão de
        público.
      </p>
    </>
  )
}
