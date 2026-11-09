import type { SubscriptionStanding } from '@findsports_oficial/api/lib/current-plan'
import {
  ONBOARDING_TRIAL,
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
import { getScheduledCancelAt } from './scheduled-cancel'

const DAY_MS = 24 * 60 * 60 * 1000

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
export type PlanPerkKey = 'badge' | 'events' | 'menu' | 'going' | 'house_offer'

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
  highlight?: boolean
  badge?: string
}

/** Sem limite de jogos: o que o Starter troca por `STARTER_EVENT_LIMIT`. */
const UNLIMITED_EVENTS_FEATURE = 'Jogos ilimitados na agenda'

/** Todo plano tem; a página de planos a cobre com "Perfil completo com agenda e rota". */
const BAR_PROFILE_FEATURE = 'Perfil do bar no Onside'

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
      BAR_PROFILE_FEATURE,
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
    ]
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
      BAR_PROFILE_FEATURE,
      UNLIMITED_EVENTS_FEATURE,
      'Destaque na busca por time e liga',
      'Pin destacado no mapa',
      'Suporte por e-mail',
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
      { label: 'Galeria de fotos do ambiente', status: 'live' },
      { label: 'Promoções no perfil', status: 'soon' }
    ]
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
      BAR_PROFILE_FEATURE,
      UNLIMITED_EVENTS_FEATURE,
      'Destaque na busca por time e liga',
      'Pin exclusivo Elite no mapa',
      'Suporte por e-mail',
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
        label: 'Lista de quem vai assistir, jogo a jogo',
        status: 'live',
        key: 'going'
      },
      // Sem exemplo de oferta: a Onside não sugere o conteúdo (WEB-120).
      {
        label: 'Oferta da casa para quem chega pela Onside',
        status: 'live',
        key: 'house_offer'
      },
      { label: 'Galeria de fotos do ambiente', status: 'live' },
      { label: 'Promoções no perfil', status: 'soon' }
    ]
  }
]

export const PLAN_TIER_ORDER: Record<SubscriptionPlan, number> = {
  starter: 0,
  pro: 1,
  elite: 2
}

export type PlanOrigin = 'admin' | 'billing'

/**
 * O que todos os planos têm, numa linha só abaixo dos cartões da página de
 * planos: o perfil do Starter e os itens do painel que os três repetem.
 */
export function getCommonPlanItems(): string[] {
  const [first, ...rest] = PLAN_CATALOG
  if (!first) return []
  return [
    ...livePerks(first.id).map((perk) => perk.label),
    ...first.features.filter(
      (feature) =>
        feature !== BAR_PROFILE_FEATURE &&
        rest.every((plan) => plan.features.includes(feature))
    )
  ]
}

/**
 * O que o cartão de um plano lista na página de planos: só o que ele
 * acrescenta ao plano anterior, sem o que todos têm (`getCommonPlanItems`).
 * Assim nenhum item some e nenhum aparece três vezes.
 */
export function getPlanCardLists(plan: Plan): {
  lead: string
  panel: string[]
  profile: PlanProfilePerk[]
} {
  const index = PLAN_CATALOG.findIndex((item) => item.id === plan.id)
  const previous = index > 0 ? PLAN_CATALOG[index - 1] : undefined
  const common = new Set([...getCommonPlanItems(), BAR_PROFILE_FEATURE])
  const before = new Set([
    ...(previous?.features ?? []),
    ...(previous?.profilePerks.map((perk) => perk.label) ?? [])
  ])
  return {
    lead: previous ? `Tudo do ${previous.name}, e mais` : 'O essencial',
    panel: plan.features.filter(
      (feature) => !common.has(feature) && !before.has(feature)
    ),
    profile: plan.profilePerks.filter(
      (perk) =>
        !perk.includes && !common.has(perk.label) && !before.has(perk.label)
    )
  }
}

export function getPlan(id: SubscriptionPlan): Plan {
  const entry = PLAN_CATALOG.find((p) => p.id === id)
  if (!entry) throw new Error(`Plan ${id} not found in catalog`)
  return entry
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
}

/**
 * O que a perda significa para este bar, com o que ele tem hoje; `null`
 * quando não há o que dizer além do item do catálogo. Só o Starter limita
 * jogos, e o limite vale para criar: os já cadastrados continuam no ar
 * (WEB-352). Cardápio, gasto médio e oferta ficam gravados e voltam com o
 * plano. No teste grátis não há cobrança: o limite conta por mês.
 */
export function getPlanLossNote(
  key: PlanLoss['key'],
  bar: PlanLossBar,
  onTrial = false
): string | null {
  switch (key) {
    case 'events':
      return `${
        bar.upcomingEvents > 0
          ? `Você tem ${countLabel(bar.upcomingEvents, 'jogo futuro', 'jogos futuros')}. `
          : ''
      }Os jogos já cadastrados continuam no ar, mas no ${PLAN_NAMES.starter} só dá para criar ${STARTER_EVENT_LIMIT} por ${onTrial ? 'mês' : 'ciclo de cobrança'}.`
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

export function parsePlanOrigin(value: unknown): PlanOrigin | undefined {
  if (value === 'admin' || value === 'billing') return value
  return undefined
}

export function getPlanExitLink(origin: PlanOrigin | undefined) {
  switch (origin) {
    case 'billing':
      return { label: 'Voltar à assinatura', to: '/admin/billing' as const }
    // O cadastro termina na tela "no ar", não aqui: quem chega sem origem
    // veio do painel ou de um link, e volta para ele.
    default:
      return { label: 'Voltar ao painel', to: '/admin' as const }
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
 *   cobrança só sai quando o teste acabaria (WEB-31). Também pode trocar o
 *   plano do teste sem cartão, quantas vezes quiser (WEB-358).
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
  /** A frase do celular, quando a de cima é longa demais para ele. */
  short?: string
} {
  const name = subscription ? getPlan(subscription.plan).name : ''
  const mode = getPlanPageMode(subscription)
  switch (subscription?.standing) {
    case 'past_due':
      // O bar segue no ar com os recursos do Starter (WEB-357 não vale aqui).
      return {
        kicker: LAPSED_COPY.past_due.label,
        title: `Regularize seu plano ${name}`,
        text: `${LAPSED_COPY.past_due.cause} O bar segue no ar com os recursos do ${PLAN_NAMES.starter} até você atualizar o pagamento na sua assinatura; aí os do ${name} voltam, sem contratar de novo.`
      }
    case 'trial_ended':
      return {
        kicker: 'Teste encerrado',
        title: `Seu teste do ${name} acabou`,
        text:
          mode === 'regularize'
            ? 'O teste grátis terminou sem pagamento confirmado. Confirme o pagamento na sua assinatura e os recursos do plano voltam, sem contratar de novo.'
            : 'O teste grátis terminou sem plano contratado. Contrate um plano para o bar voltar às buscas e ao mapa; a grade e os dados continuam guardados.'
      }
    case 'current':
      if (mode === 'trial' && subscription.currentPeriodEnd) {
        const until = new Date(
          subscription.currentPeriodEnd
        ).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' })
        return {
          kicker: 'Plano e teste',
          title: `Você está testando o ${name}`,
          // WEB-358: o teste vale para qualquer plano, com a mesma data.
          text: `${TRIAL_NO_CARD_NOTE} Até ${until}, teste qualquer plano sem mudar a data. Quer garantir o plano desde já? Contrate: o cartão fica guardado e a primeira cobrança só sai em ${until}.`,
          short: 'Teste qualquer plano sem mudar a data.'
        }
      }
      {
        const cancelAt = getScheduledCancelAt({
          standing: subscription.standing,
          cancelAt: subscription.cancelAt ?? null
        })
        if (cancelAt) {
          return {
            kicker: `Cancela em ${cancelAt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`,
            title: `Seu ${name} vai até ${cancelAt.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' })}`,
            text: 'Você pediu o cancelamento, e o plano segue até lá. Mudou de ideia? Dá para manter a assinatura.'
          }
        }
      }
      return {
        kicker: 'Plano e cobrança',
        title: `Seu plano é o ${name}`,
        // O mesmo crédito que a confirmação de plano menor anuncia.
        text: earnsDowngradeCredit(subscription)
          ? 'Troque quando quiser, vale na hora. Subir cobra a diferença do mês, proporcional; descer vira crédito na sua conta e abate as próximas mensalidades.'
          : 'Troque quando quiser, vale na hora, e a diferença de preço do mês é acertada de forma proporcional.',
        short: 'Troque quando quiser.'
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

/**
 * O teste do cadastro no placar de `/plan`: os dias que faltam, com o mesmo
 * piso de `getTrialNotice`, e quanto dele já passou. O começo é o fim menos
 * `ONBOARDING_TRIAL.days`; quem contratou no teste herda a mesma data.
 */
export function getTrialProgress(
  currentPeriodEnd: string | Date,
  now = new Date()
): { daysLeft: number; elapsed: number } {
  const end = new Date(currentPeriodEnd).getTime()
  const length = ONBOARDING_TRIAL.days * DAY_MS
  return {
    daysLeft: Math.max(1, Math.ceil((end - now.getTime()) / DAY_MS)),
    elapsed: Math.min(1, Math.max(0, 1 - (end - now.getTime()) / length))
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
  const days = Math.max(1, Math.ceil((end.getTime() - now.getTime()) / DAY_MS))
  const until = end.toLocaleDateString('pt-BR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  })
  return `Teste grátis até ${until} · ${days === 1 ? 'falta 1 dia' : `faltam ${days} dias`}`
}
