import type { subscription } from '@findsports_oficial/db/schema/platform'

export type SubscriptionForPlan = Pick<
  typeof subscription.$inferSelect,
  'plan' | 'status' | 'currentPeriodEnd'
>

/**
 * Plano que a assinatura dá direito agora, ou `null` sem benefício vigente.
 *
 * `bar.plan` não serve para isso: é projeção de `subscription.plan` para a
 * ordenação da busca e ignora o status — um `past_due` continua lá como
 * `elite`. Recurso pago decide por aqui.
 */
export function getCurrentPlan(
  subscription: SubscriptionForPlan | null,
  now = new Date()
) {
  if (!subscription) return null
  if (subscription.status === 'active') return subscription.plan
  if (
    subscription.status === 'trialing' &&
    subscription.currentPeriodEnd !== null &&
    subscription.currentPeriodEnd > now
  ) {
    return subscription.plan
  }
  return null
}
