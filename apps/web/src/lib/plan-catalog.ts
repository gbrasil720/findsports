import { getAnalyticsEntitlements } from '@findsports_oficial/api/lib/commercial-analytics/entitlements'
import type { AnalyticsComparisonMode } from '@findsports_oficial/api/lib/commercial-analytics/types'
import type { SubscriptionStanding } from '@findsports_oficial/api/lib/current-plan'
import {
  PLAN_NAMES,
  STARTER_EVENT_LIMIT
} from '@findsports_oficial/api/lib/plan-limits'
import type { SubscriptionPlan } from '@findsports_oficial/db'

// ---------------------------------------------------------------------------
// Plan catalog — single source of truth for pricing and entitlements
// ---------------------------------------------------------------------------

import Fire from 'reicon-react/icons/Fire'
import Star from 'reicon-react/icons/Star'
import Trophy from 'reicon-react/icons/Trophy'
import { LAPSED_COPY } from './lapsed-plan'
import { countLabel, plural } from './plural'
import { getCancelDay } from './scheduled-cancel'

export type PlanFeature = string

/**
 * O que o plano muda no perfil público do bar — a página que o torcedor abre.
 *
 * Fica separado de `features` porque tem uma regra própria: `soon` é promessa,
 * e promessa precisa estar rotulada como tal na tela de contratação. Sem essa
 * distinção, o dono paga esperando um cardápio que ainda não existe.
 */
export interface PlanProfilePerk {
  label: string
  status: 'live' | 'soon'
  /** "Tudo do X": o plano herda os itens de X (WEB-351). */
  includes?: SubscriptionPlan
  /** O mesmo recurso em planos diferentes: o do plano maior vale (WEB-351). */
  key?: PlanPerkKey
}

/**
 * Recursos que o aviso de troca de plano precisa reconhecer (WEB-351): o selo,
 * que muda de plano para plano, e os que têm dado do próprio bar para citar.
 */
export type PlanPerkKey =
  | 'badge'
  | 'events'
  | 'menu'
  | 'reservations'
  | 'house_offer'

export interface PlanAnalytics {
  historyDays: number | null
  perGame: 'basic' | 'complete'
  comparison: AnalyticsComparisonMode
}

function analyticsForPlan(id: SubscriptionPlan): PlanAnalytics {
  const entitlements = getAnalyticsEntitlements(id)
  if (entitlements.eventBreakdown === 'none') {
    throw new Error(`Plan ${id} has no per-game analytics entitlement`)
  }

  return {
    historyDays: entitlements.maxDaysRetention,
    perGame: entitlements.eventBreakdown,
    comparison: entitlements.comparison
  }
}

/**
 * Desconto de fundador, em reais por mês: valor fixo, igual em todos os
 * planos — a regra dos Termos de Uso ("Desconto de fundador"). O teste amarra
 * este número e os preços abaixo à tabela publicada lá (WEB-112).
 */
export const FOUNDER_DISCOUNT = 28

/** Os dois preços de um plano saem de um número só: a tabela cheia. */
function pricesFor(tablePrice: number) {
  return { tablePrice, founderPrice: tablePrice - FOUNDER_DISCOUNT }
}

export function formatPlanPrice(reais: number): string {
  return `R$ ${reais}`
}

export type PlanChargeDisplay = {
  chargeReais: number
  /** Preço de lista no Stripe, só quando há desconto confirmado ou prometido. */
  listReais: number | null
  hint: string | null
}

/**
 * Cupom de fundador para o preço de vitrine, a partir da consulta. `null`
 * enquanto ela não responde: o valor ainda pode trocar de tabela cheia para
 * fundador, e quem desenha o preço mostra carregamento no lugar dele.
 * Consulta que falhou vale tabela cheia, como sempre valeu.
 */
export function founderCouponFromQuery(query: {
  isPending: boolean
  data?: { available: boolean }
}): boolean | null {
  if (query.isPending) return null
  return query.data?.available ?? false
}

export function planChargeForShowcase(
  plan: Pick<Plan, 'tablePrice' | 'founderPrice'>,
  founderCouponAvailable: boolean,
  hasSubscription?: boolean
): PlanChargeDisplay
export function planChargeForShowcase(
  plan: Pick<Plan, 'tablePrice' | 'founderPrice'>,
  founderCouponAvailable: boolean | null,
  hasSubscription?: boolean
): PlanChargeDisplay | null
export function planChargeForShowcase(
  plan: Pick<Plan, 'tablePrice' | 'founderPrice'>,
  // `null`: cupom ainda carregando, sem preço a mostrar (`founderCouponFromQuery`).
  founderCouponAvailable: boolean | null,
  // Quem já assina troca de plano pelo portal, sem checkout (WEB-353).
  hasSubscription = false
): PlanChargeDisplay | null {
  if (founderCouponAvailable === null) return null
  if (founderCouponAvailable) {
    return {
      chargeReais: plan.founderPrice,
      listReais: plan.tablePrice,
      hint: hasSubscription
        ? 'Com desconto de fundador na assinatura'
        : 'Com desconto de fundador no checkout'
    }
  }
  return {
    chargeReais: plan.tablePrice,
    listReais: null,
    hint: null
  }
}

/**
 * Valor mensal com base no desconto gravado pelo webhook (`monthlyDiscountReais`).
 * `null` no banco = não sabemos: mostra só a tabela, sem riscar.
 */
export function planChargeFromSubscription(
  plan: Pick<Plan, 'tablePrice' | 'founderPrice'>,
  monthlyDiscountReais: number | null | undefined
): PlanChargeDisplay {
  if (monthlyDiscountReais == null) {
    return {
      chargeReais: plan.tablePrice,
      listReais: null,
      hint: null
    }
  }
  if (monthlyDiscountReais <= 0) {
    return {
      chargeReais: plan.tablePrice,
      listReais: null,
      hint: null
    }
  }
  return {
    chargeReais: plan.tablePrice - monthlyDiscountReais,
    listReais: plan.tablePrice,
    hint: 'Com desconto de fundador na assinatura'
  }
}

/**
 * Preço do card "Plano atual" (WEB-343). Sem assinatura no Stripe (teste do
 * cadastro, vigente ou vencido) não há desconto gravado: vale o que `/plan`
 * promete para quem contratar. Com assinatura, vale o que o webhook gravou.
 */
export function planChargeForCurrentPlan(
  plan: Pick<Plan, 'tablePrice' | 'founderPrice'>,
  subscription: {
    externalSubscriptionId: string | null
    monthlyDiscountReais: number | null
  },
  founderCouponAvailable: boolean
): PlanChargeDisplay
export function planChargeForCurrentPlan(
  plan: Pick<Plan, 'tablePrice' | 'founderPrice'>,
  subscription: {
    externalSubscriptionId: string | null
    monthlyDiscountReais: number | null
  },
  founderCouponAvailable: boolean | null
): PlanChargeDisplay | null
export function planChargeForCurrentPlan(
  plan: Pick<Plan, 'tablePrice' | 'founderPrice'>,
  subscription: {
    externalSubscriptionId: string | null
    monthlyDiscountReais: number | null
  },
  founderCouponAvailable: boolean | null
): PlanChargeDisplay | null {
  return subscription.externalSubscriptionId
    ? planChargeFromSubscription(plan, subscription.monthlyDiscountReais)
    : planChargeForShowcase(plan, founderCouponAvailable)
}

export function formatPlanChargeLine(
  display: PlanChargeDisplay,
  period: string
): string {
  const charge = `${formatPlanPrice(display.chargeReais)}${period}`
  if (display.listReais == null) return charge
  return `${charge} (tabela cheia ${formatPlanPrice(display.listReais)}${period})`
}

/** @deprecated Só para textos legais; preferir {@link formatPlanChargeLine}. */
export const FOUNDER_DISCOUNT_NOTE = `Com o desconto de fundador aplicado na contratação, ${formatPlanPrice(FOUNDER_DISCOUNT)} por mês a menos que a tabela cheia.`

export interface Plan {
  id: SubscriptionPlan
  name: string
  tagline: string
  description: string
  /** Tabela cheia, em reais por mês — o preço do produto no provedor. */
  tablePrice: number
  /** Tabela menos `FOUNDER_DISCOUNT`. */
  founderPrice: number
  period: string
  icon: React.ComponentType<{ size?: number | string; color?: string }>
  features: PlanFeature[]
  profilePerks: PlanProfilePerk[]
  analytics: PlanAnalytics
  highlight?: boolean
  badge?: string
}

/** Sem limite de jogos: o que o Starter troca por `STARTER_EVENT_LIMIT`. */
const UNLIMITED_EVENTS_FEATURE = 'Jogos ilimitados na agenda'

export const PLAN_CATALOG: Plan[] = [
  {
    id: 'starter',
    name: PLAN_NAMES.starter,
    tagline: 'Pra começar a aparecer',
    description: 'Analytics básicos para começar a entender seu público.',
    ...pricesFor(97),
    period: '/mês',
    icon: Fire,
    features: [
      'Perfil do bar no Onside',
      `Até ${STARTER_EVENT_LIMIT} jogos por ciclo de cobrança na agenda`,
      'Aparece nas buscas básicas',
      'Suporte por e-mail',
      'Analytics essenciais dos últimos 30 dias',
      'Desempenho básico por jogo',
      'Comparação com período anterior'
    ],
    profilePerks: [
      { label: 'Perfil completo com agenda e rota', status: 'live' },
      { label: 'Contato direto por WhatsApp', status: 'live' },
      { label: 'Foto de capa', status: 'live' }
    ],
    analytics: {
      ...analyticsForPlan('starter')
    }
  },
  {
    id: 'pro',
    name: PLAN_NAMES.pro,
    tagline: 'Pra lotar nos clássicos',
    description: 'Analytics completos para otimizar sua operação.',
    ...pricesFor(147),
    period: '/mês',
    icon: Star,
    highlight: true,
    features: [
      'Perfil do bar no Onside',
      UNLIMITED_EVENTS_FEATURE,
      'Destaque na busca por time e liga',
      'Pin destacado no mapa',
      'Suporte prioritário',
      '12 meses de histórico',
      'Analytics completa por jogo',
      'Funil detalhado de rota, telefone e WhatsApp',
      'Comparação entre jogos'
    ],
    profilePerks: [
      { label: 'Tudo do Starter', status: 'live', includes: 'starter' },
      { label: 'Selo Pro no perfil', status: 'live', key: 'badge' },
      { label: 'Capa em destaque, o dobro da altura', status: 'live' },
      {
        label: 'Link do cardápio e preço médio no perfil',
        status: 'live',
        key: 'menu'
      },
      { label: 'Galeria de fotos do ambiente', status: 'soon' },
      { label: 'Promoções no perfil', status: 'soon' }
    ],
    analytics: {
      ...analyticsForPlan('pro')
    }
  },
  {
    id: 'elite',
    name: PLAN_NAMES.elite,
    tagline: 'Pra ser referência na cidade',
    description: 'Analytics avançados com insights estratégicos.',
    ...pricesFor(297),
    period: '/mês',
    icon: Trophy,
    features: [
      'Perfil do bar no Onside',
      UNLIMITED_EVENTS_FEATURE,
      'Destaque na busca por time e liga',
      'Pin exclusivo Elite no mapa',
      'Suporte prioritário',
      'Topo na busca por relevância quando há um clássico',
      'Histórico completo',
      'Analytics completa por jogo',
      'Funil detalhado de rota, telefone e WhatsApp',
      'Inteligência avançada',
      'Comparação avançada'
    ],
    profilePerks: [
      { label: 'Tudo do Pro', status: 'live', includes: 'pro' },
      { label: 'Selo Elite no topo do perfil', status: 'live', key: 'badge' },
      {
        label: 'Link do cardápio e preço médio no perfil',
        status: 'live',
        key: 'menu'
      },
      {
        label: 'Reserva de mesa pela plataforma',
        status: 'live',
        key: 'reservations'
      },
      // Sem exemplo de oferta: a Onside não sugere o conteúdo (WEB-120).
      {
        label: 'Oferta da casa para quem chega pela Onside',
        status: 'live',
        key: 'house_offer'
      },
      { label: 'Galeria de fotos do ambiente', status: 'soon' },
      { label: 'Promoções no perfil', status: 'soon' }
    ],
    analytics: {
      ...analyticsForPlan('elite')
    }
  }
]

export const PLAN_TIER_ORDER: Record<SubscriptionPlan, number> = {
  starter: 0,
  pro: 1,
  elite: 2
}

/**
 * Padrão de `billing.checkout_enabled` enquanto a configuração não chega.
 * Espelha o do servidor: o registro não roda no navegador (lê `process.env`),
 * então o teste amarra os dois.
 */
export const CHECKOUT_ENABLED_DEFAULT = false

export type PlanOrigin = 'admin' | 'billing'

export function getPlan(id: SubscriptionPlan): Plan {
  const entry = PLAN_CATALOG.find((p) => p.id === id)
  if (!entry) throw new Error(`Plan ${id} not found in catalog`)
  return entry
}

/** Os dois preços de um plano à venda, no vocabulário dos Termos de Uso. */
export function formatPlanPricing(
  plan: Pick<Plan, 'tablePrice' | 'founderPrice' | 'period'>
): string {
  return `${formatPlanPrice(plan.founderPrice)}${plan.period} com desconto de fundador · tabela cheia ${formatPlanPrice(plan.tablePrice)}${plan.period}`
}

export function getAnalyticsEntitlement(id: SubscriptionPlan): PlanAnalytics {
  return getPlan(id).analytics
}

export function isDowngrade(
  current: SubscriptionPlan,
  target: SubscriptionPlan
): boolean {
  return PLAN_TIER_ORDER[target] < PLAN_TIER_ORDER[current]
}

/**
 * Itens do perfil em vigor no plano, com os herdados por `includes`. O do
 * próprio plano vence o herdado de mesma `key`: o Elite não tem o selo Pro.
 */
function livePerks(id: SubscriptionPlan): PlanProfilePerk[] {
  const perks = new Map<string, PlanProfilePerk>()
  for (const perk of getPlan(id).profilePerks) {
    const items = perk.includes
      ? livePerks(perk.includes)
      : perk.status === 'live'
        ? [perk]
        : []
    for (const item of items) perks.set(item.key ?? item.label, item)
  }
  return [...perks.values()]
}

export interface PlanLoss {
  label: string
  key?: PlanPerkKey
}

/**
 * O que o bar deixa de ter ao trocar `current` por `target` (WEB-351): o que o
 * catálogo lista no plano atual e não no de destino. Vazio quando a troca não
 * é para um plano menor.
 */
export function getPlanLosses(
  current: SubscriptionPlan,
  target: SubscriptionPlan
): PlanLoss[] {
  if (!isDowngrade(current, target)) return []
  const kept = new Set([
    ...getPlan(target).features,
    ...livePerks(target).map((perk) => perk.label)
  ])
  return [
    ...getPlan(current).features.map(
      (label): PlanLoss =>
        label === UNLIMITED_EVENTS_FEATURE
          ? { label, key: 'events' }
          : { label }
    ),
    ...livePerks(current).map(({ label, key }): PlanLoss => ({ label, key }))
  ].filter((loss) => !kept.has(loss.label))
}

/** Os números do próprio bar que o aviso de troca cita (WEB-351). */
export interface PlanLossBar {
  /** Jogos que ainda não acabaram. */
  upcomingEvents: number
  houseOffer: string | null
  menuUrl: string | null
  averageSpendCents: number | null
  acceptsReservations: boolean
}

/**
 * O que a perda significa para este bar, com o que ele tem hoje; `null`
 * quando não há o que dizer além do item do catálogo. Só o Starter limita
 * jogos, e o limite vale para criar: os já cadastrados continuam no ar
 * (WEB-352). Cardápio, gasto médio e oferta ficam gravados e voltam com o
 * plano.
 */
export function getPlanLossNote(
  key: PlanLoss['key'],
  bar: PlanLossBar
): string | null {
  switch (key) {
    case 'events':
      return `${
        bar.upcomingEvents > 0
          ? `Você tem ${countLabel(bar.upcomingEvents, 'jogo futuro', 'jogos futuros')}. `
          : ''
      }Os jogos já cadastrados continuam no ar, mas no ${PLAN_NAMES.starter} só dá para criar ${STARTER_EVENT_LIMIT} por ciclo de cobrança.`
    case 'menu': {
      const items = [
        ...(bar.menuUrl ? ['seu link do cardápio'] : []),
        ...(bar.averageSpendCents !== null ? ['seu gasto médio'] : [])
      ]
      if (items.length === 0) return null
      const text = items.join(' e ')
      return `${text[0]?.toUpperCase()}${text.slice(1)} ${plural(items.length, 'sai do perfil e fica guardado', 'saem do perfil e ficam guardados')}.`
    }
    case 'house_offer':
      return bar.houseOffer
        ? 'Sua oferta da casa sai do perfil e fica guardada.'
        : null
    case 'reservations':
      return bar.acceptsReservations
        ? 'Seu bar para de receber novos pedidos de reserva.'
        : null
    default:
      return null
  }
}

function parsePlanId(value: unknown): SubscriptionPlan | undefined {
  return PLAN_CATALOG.find((plan) => plan.id === value)?.id
}

/**
 * A troca pedida em `/plan`, lida da busca de `/admin/billing` (WEB-351). É só
 * o pedido: o dono pode voltar do portal sem confirmar, e quem diz que a troca
 * aconteceu é a assinatura.
 */
export function parsePlanChange(search: Record<string, unknown>): {
  planFrom?: SubscriptionPlan
  planTo?: SubscriptionPlan
} {
  const planFrom = parsePlanId(search.planFrom)
  const planTo = parsePlanId(search.planTo)
  return planFrom && planTo && planFrom !== planTo ? { planFrom, planTo } : {}
}

/** Para onde o portal devolve depois da troca de `from` para `to`. */
export function planChangeReturnUrl(
  from: SubscriptionPlan,
  to: SubscriptionPlan
): string {
  return `/admin/billing?planFrom=${from}&planTo=${to}`
}

export function getPlanSelectionState(
  current: SubscriptionPlan | null,
  selected: SubscriptionPlan
) {
  return {
    isDowngrade: current !== null && isDowngrade(current, selected),
    isSamePlan: current === selected
  }
}

export function parsePlanOrigin(value: unknown): PlanOrigin | undefined {
  if (value === 'admin' || value === 'billing') return value
  return undefined
}

export function getPlanExitLink(origin: PlanOrigin | undefined) {
  switch (origin) {
    case 'admin':
      return { label: 'Voltar', to: '/admin' as const }
    case 'billing':
      return { label: 'Voltar', to: '/admin/billing' as const }
    default:
      return { label: 'Ver planos depois', to: '/admin' as const }
  }
}

/** O que `/plan` e `/admin/billing` leem da assinatura para escolher a ação. */
type PlanSubscription =
  | {
      plan: SubscriptionPlan
      status: string
      standing: SubscriptionStanding | null
      currentPeriodEnd: string | Date | null
      externalSubscriptionId: string | null
      cancelAt?: string | Date | null
    }
  | null
  | undefined

/**
 * Só assinatura paga no Stripe gera crédito proporcional na troca para um
 * plano menor (WEB-350); em teste grátis não há o que creditar.
 */
export function earnsDowngradeCredit(
  subscription:
    | { status: string; externalSubscriptionId?: string | null }
    | null
    | undefined
): boolean {
  return (
    subscription?.status === 'active' &&
    Boolean(subscription.externalSubscriptionId)
  )
}

/**
 * O teste grátis nasce no cadastro, sem cartão (WEB-31). Dito com as mesmas
 * palavras onde o teste aparece, para ninguém achar que precisa pagar antes.
 */
export const TRIAL_NO_CARD_NOTE = 'O teste grátis não pede cartão.'

/**
 * O que `/plan` oferece, pelo nosso estado da assinatura — nunca por consulta
 * ao provedor (WEB-249):
 *
 * - `trial`: teste grátis do cadastro em vigor, sem nada no provedor. O bar
 *   pode contratar qualquer plano já: o checkout guarda o cartão e a primeira
 *   cobrança só sai quando o teste acabaria (WEB-31).
 * - `regularize`: assinatura paga parada. Ela existe no provedor, e um
 *   checkout novo abriria outra (WEB-170).
 * - `checkout`: o resto. Inclui o teste vencido sem assinatura no provedor (é
 *   uma linha local, sem nada a regularizar — esse bar ainda não contratou) e
 *   quem já contratou e quer trocar de plano.
 */
export type PlanPageMode = 'checkout' | 'trial' | 'regularize'

export function getPlanPageMode(subscription: PlanSubscription): PlanPageMode {
  switch (subscription?.standing) {
    case 'current':
      return subscription.status === 'trialing' &&
        !subscription.externalSubscriptionId
        ? 'trial'
        : 'checkout'
    case 'past_due':
      return 'regularize'
    case 'trial_ended':
      return subscription.externalSubscriptionId ? 'regularize' : 'checkout'
    default:
      return 'checkout'
  }
}

/**
 * Plano que `/plan` abre selecionado: o da assinatura, vigente ou não, e o Pro
 * só para quem nunca teve uma. Nunca um plano abaixo do atual, nem outro plano
 * a um clique do checkout (WEB-249).
 */
export function getDefaultPlanSelection(
  subscription: { plan: SubscriptionPlan } | null | undefined
): SubscriptionPlan {
  return subscription?.plan ?? 'pro'
}

/**
 * Cabeçalho de `/plan` pela situação da assinatura (WEB-170). Plano parado
 * regulariza em vez de contratar: checkout do provedor sempre abre assinatura
 * nova, e a parada seguiria cobrando quando o cartão voltasse. Quem já teve
 * assinatura não está no "último passo" do cadastro, e quem está em trial
 * ainda não paga: nada de "próximo ciclo de cobrança" (WEB-261). Com
 * cancelamento agendado o cabeçalho diz a data, como o aviso da página, em vez
 * de convidar a trocar de plano.
 */
export function getPlanHeader(subscription: PlanSubscription): {
  kicker: string
  title: string
  text: string
} {
  const name = subscription ? getPlan(subscription.plan).name : ''
  const mode = getPlanPageMode(subscription)
  switch (subscription?.standing) {
    case 'past_due':
      return {
        kicker: LAPSED_COPY.past_due.label,
        title: `Regularize seu plano ${name}.`,
        text: `${LAPSED_COPY.past_due.cause} Atualize o método de pagamento na sua assinatura e os recursos do plano voltam, sem contratar de novo.`
      }
    case 'trial_ended':
      return {
        kicker: LAPSED_COPY.trial_ended.label,
        title: `Continue no plano ${name}.`,
        text:
          mode === 'regularize'
            ? `${LAPSED_COPY.trial_ended.cause} Confirme o pagamento na sua assinatura e os recursos do plano voltam, sem contratar de novo.`
            : `${LAPSED_COPY.trial_ended.cause} Contrate o plano para os recursos voltarem, ou escolha outro abaixo.`
      }
    case 'current':
      if (mode === 'trial' && subscription.currentPeriodEnd) {
        const until = new Date(
          subscription.currentPeriodEnd
        ).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' })
        return {
          kicker: 'Trial gratuito',
          title: `Você está no trial do ${name} até ${until}.`,
          text: `${TRIAL_NO_CARD_NOTE} Se quiser garantir o plano desde já, contrate abaixo: o cartão fica guardado e a primeira cobrança só sai em ${until}.`
        }
      }
      {
        const cancelDay = getCancelDay({
          standing: subscription.standing,
          cancelAt: subscription.cancelAt ?? null
        })
        if (cancelDay) {
          return {
            kicker: 'Cancelamento agendado',
            title: `Seu plano ${name} cancela em ${cancelDay}.`,
            text: 'O plano segue até lá. Para continuar depois dessa data, reative a assinatura.'
          }
        }
      }
      return {
        kicker: 'Alterar plano',
        title: 'Escolha seu novo plano.',
        // O mesmo crédito que o aviso de plano inferior de `/plan` anuncia.
        text: earnsDowngradeCredit(subscription)
          ? 'A troca vale na hora. Para um plano maior, a diferença do mês é cobrada de forma proporcional; para um menor, vira crédito na sua conta e abate as próximas mensalidades.'
          : 'A troca vale na hora, e a diferença de preço do mês é acertada de forma proporcional.'
      }
    case 'ended':
      return {
        kicker: 'Reativar plano',
        title: 'Escolha um plano para voltar.',
        text: 'Seu bar volta a aparecer nas buscas e no mapa assim que o pagamento for confirmado.'
      }
    default:
      return {
        kicker: 'Último passo',
        title: 'Escolha o plano do seu bar.',
        // Sem prometer dias grátis: o número que estava aqui não existia em
        // fonte nenhuma (WEB-261). Qual prometer é assunto da WEB-114.
        text: 'Você pode trocar ou cancelar quando quiser.'
      }
  }
}

/** Selo de quem contratou antes do fim do teste (WEB-347). */
export const CONTRACTED_TRIAL_LABEL = 'Contratado · em teste'

/**
 * Trial em vigor que já é do Stripe: o dono contratou antes do fim, o cartão
 * está guardado e o plano segue depois do teste (WEB-347). O avesso do modo
 * `trial` de `getPlanPageMode`.
 */
export function isContractedTrial(
  subscription:
    | {
        status: string
        standing: SubscriptionStanding | null
        externalSubscriptionId?: string | null
      }
    | null
    | undefined
): boolean {
  return (
    subscription?.status === 'trialing' &&
    subscription.standing === 'current' &&
    Boolean(subscription.externalSubscriptionId)
  )
}

/**
 * Status do trial em vigor, com a data final e os dias que faltam — o mesmo
 * texto no painel, na assinatura e em `/plan` (WEB-260). `null` fora dele:
 * trial vencido é plano parado e fala por `LAPSED_COPY`. Quem já contratou
 * lê quando e quanto sai a primeira cobrança, pelo mesmo cálculo do card do
 * plano (WEB-347).
 */
export function getTrialNotice(
  subscription:
    | {
        status: string
        standing: SubscriptionStanding | null
        currentPeriodEnd: string | Date | null
        plan?: SubscriptionPlan
        externalSubscriptionId?: string | null
        monthlyDiscountReais?: number | null
      }
    | null
    | undefined,
  now = new Date()
): string | null {
  if (
    subscription?.status !== 'trialing' ||
    subscription.standing !== 'current' ||
    !subscription.currentPeriodEnd
  ) {
    return null
  }
  const end = new Date(subscription.currentPeriodEnd)
  if (isContractedTrial(subscription) && subscription.plan) {
    const { chargeReais } = planChargeFromSubscription(
      getPlan(subscription.plan),
      subscription.monthlyDiscountReais
    )
    return `Primeira cobrança de ${formatPlanPrice(chargeReais)} em ${end.toLocaleDateString('pt-BR')}`
  }
  // `standing` vem do relógio do servidor; o piso cobre o do navegador adiantado.
  const days = Math.max(
    1,
    Math.ceil((end.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
  )
  const until = end.toLocaleDateString('pt-BR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  })
  return `Trial gratuito até ${until} · ${days === 1 ? 'falta 1 dia' : `faltam ${days} dias`}`
}

export function formatHistoryWindow(a: PlanAnalytics): string {
  if (a.historyDays === null) return 'Histórico completo'
  if (a.historyDays >= 365) return '12 meses'
  return `${a.historyDays} dias`
}

export function formatPerGame(a: PlanAnalytics): string {
  return a.perGame === 'basic'
    ? 'Desempenho básico por jogo'
    : 'Analytics completa por jogo'
}

export function formatComparison(a: PlanAnalytics): string {
  switch (a.comparison) {
    case 'previous_period':
      return 'Comparação com período anterior'
    case 'cross_game':
      return 'Comparação entre jogos e períodos'
    case 'advanced':
      return 'Comparação avançada'
  }
}
