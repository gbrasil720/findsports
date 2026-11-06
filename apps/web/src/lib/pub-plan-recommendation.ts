import {
  PLAN_NAMES,
  STARTER_EVENT_LIMIT
} from '@findsports_oficial/api/lib/plan-limits'
import type { SubscriptionPlan } from '@findsports_oficial/db'
import { PLAN_TIER_ORDER } from './plan-catalog'

/*
 * "Sua rotina" e "Plano" do cadastro do bar (WEB-501; design no protótipo do
 * painel, `cadastro()`): a rotina só recomenda, não é gravada em lugar nenhum,
 * e quem escolhe o plano do teste é o dono. Cada motivo diz o recurso pelo
 * nome que ele tem no catálogo (`plan-catalog.ts`).
 */

export type Want =
  | 'cardapio'
  | 'destaque'
  | 'funil'
  | 'quemvai'
  | 'oferta'
  | 'classico'

export const WANTS: {
  id: Want
  label: string
  plan: SubscriptionPlan
  reason: string
}[] = [
  {
    id: 'cardapio',
    label: 'Mostrar meu cardápio e o preço médio',
    plan: 'pro',
    reason: 'Link do cardápio e preço médio no perfil aparecem a partir do Pro'
  },
  {
    id: 'destaque',
    label: 'Aparecer quando buscam o meu time',
    plan: 'pro',
    reason: 'Destaque na busca por time e liga é do Pro'
  },
  {
    id: 'funil',
    label: 'Saber quantos pediram rota ou me chamaram',
    plan: 'pro',
    reason:
      'Quantos pediram rota, ligaram ou chamaram no WhatsApp aparece a partir do Pro'
  },
  {
    id: 'quemvai',
    label: 'Saber quantos vão vir a cada jogo',
    plan: 'elite',
    reason: 'Saber quem vai assistir, jogo a jogo, só existe no Elite'
  },
  {
    id: 'oferta',
    label: 'Dar uma oferta pra quem vem pela Onside',
    plan: 'elite',
    reason: 'Oferta da casa com código do balcão só existe no Elite'
  },
  {
    id: 'classico',
    label: 'Ficar no topo em dia de clássico',
    plan: 'elite',
    reason: 'Topo da busca nos clássicos só existe no Elite'
  }
]

/** Os dois números da rotina: passo, mínimo e máximo de cada um. */
export const ROUTINE_STEPS = {
  games: { step: 1, min: 1, max: 60 },
  spend: { step: 5, min: 10, max: 500 }
} as const

export type Routine = { games: number; spend: number; wants: Want[] }

/** Ponto de partida dos dois números; o que o dono espera começa vazio. */
export const DEFAULT_ROUTINE: Routine = { games: 12, spend: 80, wants: [] }

/**
 * O maior plano que a rotina pede: mais jogos que o Starter cria por mês pede
 * o Pro, e cada coisa marcada pede o plano em que ela existe. Sem nada, o
 * Starter.
 */
export function recommendPlan(routine: Routine): {
  plan: SubscriptionPlan
  reasons: string[]
} {
  let plan: SubscriptionPlan = 'starter'
  const reasons: string[] = []
  const atLeast = (target: SubscriptionPlan) => {
    if (PLAN_TIER_ORDER[target] > PLAN_TIER_ORDER[plan]) plan = target
  }
  if (routine.games > STARTER_EVENT_LIMIT) {
    atLeast('pro')
    reasons.push(
      `Você passa ${routine.games} jogos por mês, e o ${PLAN_NAMES.starter} cadastra até ${STARTER_EVENT_LIMIT}`
    )
  }
  for (const want of WANTS) {
    if (!routine.wants.includes(want.id)) continue
    atLeast(want.plan)
    reasons.push(want.reason)
  }
  if (reasons.length === 0) {
    reasons.push(
      `Até ${STARTER_EVENT_LIMIT} jogos por mês e sem extras: o ${PLAN_NAMES.starter} dá conta`
    )
  }
  return { plan, reasons }
}

/**
 * Quantos clientes a mais por mês cobrem a mensalidade, com o gasto que o
 * dono informou. É uma conta, não previsão de público.
 */
export function paybackClients(monthlyPrice: number, spend: number): number {
  return Math.max(1, Math.ceil(monthlyPrice / Math.max(1, spend)))
}
