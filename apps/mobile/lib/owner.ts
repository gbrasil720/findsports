import { useQuery } from '@tanstack/react-query'
import { trpc } from '@/lib/trpc'

/*
 * O bar do dono logado (rodada 10) e o plano que vale agora. A regra é a do
 * servidor (`getCurrentPlan`, `packages/api/src/lib/current-plan.ts`): ativa
 * vale o plano; em teste, até o fim do período; o resto, nenhum. Aqui só
 * decide o que desenhar: o servidor confere de novo cada pedido.
 */

export type Plan = 'starter' | 'pro' | 'elite'

export const PLAN_NAMES: Record<Plan, string> = {
  starter: 'Starter',
  pro: 'Pro',
  elite: 'Elite'
}

/**
 * Preço por mês em reais: a tabela e o de fundador (tabela − 28). A fonte é
 * o catálogo do web (`apps/web/src/lib/plan-catalog.ts`, `pricesFor`), que o
 * teste de lá amarra aos Termos de Uso.
 */
export const PLAN_PRICES: Record<Plan, { table: number; founder: number }> = {
  starter: { table: 97, founder: 69 },
  pro: { table: 147, founder: 119 },
  elite: { table: 297, founder: 269 }
}

export function currentPlan(
  subscription: {
    plan: Plan
    status: string
    currentPeriodEnd: string | Date | null
  } | null,
  now = Date.now()
): Plan | null {
  if (!subscription) return null
  if (subscription.status === 'active') return subscription.plan
  if (
    subscription.status === 'trialing' &&
    subscription.currentPeriodEnd !== null &&
    new Date(subscription.currentPeriodEnd).getTime() > now
  )
    return subscription.plan
  return null
}

export function useOwnerBar() {
  const query = useQuery(trpc.pub.getMe.queryOptions())
  const bar = query.data
  const plan = currentPlan(bar?.subscription ?? null)
  return {
    bar,
    plan,
    planName: plan ? PLAN_NAMES[plan] : null,
    /** Código do balcão, quem vai, oferta e validação: só no Elite vigente. */
    elite: plan === 'elite',
    trial: bar?.subscription?.status === 'trialing',
    error: query.error,
    /** A conta é de bar, mas o bar ainda não existe: falta o cadastro. */
    noBar:
      (query.error as { data?: { code?: string } } | null)?.data?.code ===
      'NOT_FOUND',
    refetch: query.refetch,
    pending: query.isPending
  }
}
