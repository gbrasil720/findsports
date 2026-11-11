import { useQuery } from '@tanstack/react-query'
import { trpc } from '@/lib/trpc'

/*
 * O bar do dono logado (rodada 10) e o plano que vale agora. A regra é a do
 * servidor (`getCurrentPlan`, `packages/api/src/lib/current-plan.ts`): ativa
 * vale o plano; em teste, até o fim do período; o resto, nenhum. Aqui só
 * decide o que desenhar: o servidor confere de novo cada pedido.
 */

type Plan = 'starter' | 'pro' | 'elite'

export const PLAN_NAMES: Record<Plan, string> = {
  starter: 'Starter',
  pro: 'Pro',
  elite: 'Elite'
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
    refetch: query.refetch,
    pending: query.isPending
  }
}
