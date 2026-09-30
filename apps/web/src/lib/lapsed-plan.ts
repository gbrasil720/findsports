import type { SubscriptionPlan } from '@findsports_oficial/db'

export type LapsedPlan = {
  plan: SubscriptionPlan
  reason: 'past_due' | 'trial_ended'
}

/** Rótulo curto do motivo, para selo e resumo do painel. */
export const LAPSED_LABEL: Record<LapsedPlan['reason'], string> = {
  past_due: 'Pagamento pendente',
  trial_ended: 'Trial encerrado'
}

/**
 * Plano contratado que está sem efeito até a assinatura ser regularizada
 * (WEB-141): `past_due`, ou `trialing` que o servidor já não conta como
 * vigente — o trial venceu. `currentPlan` vem de `getCurrentPlan`, então a
 * regra do relógio fica no servidor.
 *
 * Distingue "sem plano", que vai para `/plan`, de "plano parado", que vai
 * para `/admin/billing`: mandar o segundo contratar de novo não conserta a
 * assinatura que existe. `inactive` e `cancelled` não entram — ali o plano
 * acabou.
 */
export function getLapsedPlan(
  subscription:
    | {
        plan: SubscriptionPlan
        status: string
        currentPlan: SubscriptionPlan | null
      }
    | null
    | undefined
): LapsedPlan | null {
  if (!subscription || subscription.currentPlan !== null) return null
  if (subscription.status === 'past_due') {
    return { plan: subscription.plan, reason: 'past_due' }
  }
  if (subscription.status === 'trialing') {
    return { plan: subscription.plan, reason: 'trial_ended' }
  }
  return null
}
