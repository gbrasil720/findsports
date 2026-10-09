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
}

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

export interface Plan {
  id: SubscriptionPlan
  name: string
  tagline: string
  description: string
  price: string
  period: string
  icon: React.ComponentType<{ size?: number | string; color?: string }>
  features: PlanFeature[]
  profilePerks: PlanProfilePerk[]
  analytics: PlanAnalytics
  highlight?: boolean
  badge?: string
}

export const PLAN_CATALOG: Plan[] = [
  {
    id: 'starter',
    name: PLAN_NAMES.starter,
    tagline: 'Pra começar a aparecer',
    description: 'Analytics básicos para começar a entender seu público.',
    price: 'R$ 119',
    period: '/mês',
    icon: Fire,
    features: [
      'Perfil do bar no Onside',
      `Até ${STARTER_EVENT_LIMIT} jogos por mês na agenda`,
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
    price: 'R$ 189',
    period: '/mês',
    icon: Star,
    highlight: true,
    features: [
      'Perfil do bar no Onside',
      'Jogos ilimitados na agenda',
      'Destaque na busca por time e liga',
      'Pin destacado no mapa',
      'Suporte prioritário',
      '12 meses de histórico',
      'Analytics completa por jogo',
      'Funil detalhado de rota, telefone e WhatsApp',
      'Comparação entre jogos'
    ],
    profilePerks: [
      { label: 'Tudo do Starter', status: 'live' },
      { label: 'Selo Pro no perfil', status: 'live' },
      { label: 'Capa em destaque, o dobro da altura', status: 'live' },
      { label: 'Link do cardápio e preço médio no perfil', status: 'live' },
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
    price: 'R$ 189',
    period: '/mês',
    icon: Trophy,
    features: [
      'Perfil do bar no Onside',
      'Jogos ilimitados na agenda',
      'Destaque na busca por time e liga',
      'Pin destacado no mapa',
      'Suporte prioritário',
      'Topo na busca por relevância quando há um clássico',
      'Histórico completo',
      'Analytics completa por jogo',
      'Funil detalhado de rota, telefone e WhatsApp',
      'Inteligência avançada',
      'Comparação avançada'
    ],
    profilePerks: [
      { label: 'Tudo do Pro', status: 'live' },
      { label: 'Selo Elite no topo do perfil', status: 'live' },
      { label: 'Link do cardápio e preço médio no perfil', status: 'live' },
      { label: 'Reserva de mesa pela plataforma', status: 'live' },
      // Sem exemplo de oferta: a Onside não sugere o conteúdo (WEB-120).
      { label: 'Oferta da casa para quem chega pela Onside', status: 'live' },
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

export function getAnalyticsEntitlement(id: SubscriptionPlan): PlanAnalytics {
  return getPlan(id).analytics
}

export function isDowngrade(
  current: SubscriptionPlan,
  target: SubscriptionPlan
): boolean {
  return PLAN_TIER_ORDER[target] < PLAN_TIER_ORDER[current]
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
      dodoSubscriptionId: string | null
    }
  | null
  | undefined

/**
 * O que `/plan` oferece, pelo nosso estado da assinatura — nunca por consulta
 * ao provedor (WEB-249):
 *
 * - `trial`: trial em vigor. O plano aparece como atual e nada é contratado
 *   antes do vencimento.
 * - `regularize`: assinatura paga parada. Ela existe no provedor, e um
 *   checkout novo abriria outra (WEB-170).
 * - `checkout`: o resto. Inclui o trial vencido sem assinatura no provedor: é
 *   uma linha local, sem nada a regularizar — esse bar ainda não contratou.
 */
export type PlanPageMode = 'checkout' | 'trial' | 'regularize'

export function getPlanPageMode(subscription: PlanSubscription): PlanPageMode {
  switch (subscription?.standing) {
    case 'current':
      return subscription.status === 'trialing' ? 'trial' : 'checkout'
    case 'past_due':
      return 'regularize'
    case 'trial_ended':
      return subscription.dodoSubscriptionId ? 'regularize' : 'checkout'
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
 * ainda não paga: nada de "próximo ciclo de cobrança" (WEB-261).
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
          text: 'A contratação abre aqui quando o trial terminar. Até lá, os recursos do plano seguem liberados.'
        }
      }
      return {
        kicker: 'Alterar plano',
        title: 'Escolha seu novo plano.',
        text: 'A mudança entra em vigor no próximo ciclo de cobrança.'
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
 * Status do trial em vigor, com a data final e os dias que faltam — o mesmo
 * texto no painel, na assinatura e em `/plan` (WEB-260). `null` fora dele:
 * trial vencido é plano parado e fala por `LAPSED_COPY`.
 */
export function getTrialNotice(
  subscription:
    | {
        status: string
        standing: SubscriptionStanding | null
        currentPeriodEnd: string | Date | null
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
