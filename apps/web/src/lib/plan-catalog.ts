import { STARTER_EVENT_LIMIT } from '@findsports_oficial/api/lib/plan-limits'
import type { SubscriptionPlan } from '@findsports_oficial/db'

// ---------------------------------------------------------------------------
// Plan catalog — single source of truth for pricing and entitlements
// ---------------------------------------------------------------------------

import Fire from 'reicon-react/icons/Fire'
import Star from 'reicon-react/icons/Star'
import Trophy from 'reicon-react/icons/Trophy'

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
  comparison: 'previous_period' | 'cross_game' | 'advanced'
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
    name: 'Starter',
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
      historyDays: 30,
      perGame: 'basic',
      comparison: 'previous_period'
    }
  },
  {
    id: 'pro',
    name: 'Pro',
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
      { label: 'Selo de bar verificado no perfil', status: 'live' },
      { label: 'Capa em destaque, o dobro da altura', status: 'live' },
      { label: 'Galeria de fotos do ambiente', status: 'soon' },
      { label: 'Cardápio e promoções no perfil', status: 'soon' }
    ],
    analytics: {
      historyDays: 365,
      perGame: 'complete',
      comparison: 'cross_game'
    }
  },
  {
    id: 'elite',
    name: 'Elite',
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
      'Topo da lista nos clássicos',
      'Banner patrocinado na home',
      'Histórico completo',
      'Analytics completa por jogo',
      'Funil detalhado de rota, telefone e WhatsApp',
      'Inteligência avançada',
      'Comparação avançada'
    ],
    profilePerks: [
      { label: 'Tudo do Pro', status: 'live' },
      { label: 'Selo Elite no topo do perfil', status: 'live' },
      { label: 'Galeria de fotos do ambiente', status: 'soon' },
      { label: 'Cardápio e promoções no perfil', status: 'soon' },
      { label: 'Reserva de mesa pela plataforma', status: 'soon' }
    ],
    analytics: {
      historyDays: null,
      perGame: 'complete',
      comparison: 'advanced'
    }
  }
]

export const PLAN_TIER_ORDER: Record<SubscriptionPlan, number> = {
  starter: 0,
  pro: 1,
  elite: 2
}

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
