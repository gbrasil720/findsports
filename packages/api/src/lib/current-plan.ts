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

/**
 * Em que pé a assinatura está, para a interface escolher a ação (WEB-141).
 *
 * `past_due` e `trial_ended` são plano parado: o dono regulariza a assinatura
 * que existe, e um checkout novo abriria outra. `ended` é assinatura que
 * acabou e pode ser contratada de novo. Deriva de `getCurrentPlan` para as
 * duas regras não divergirem.
 */
export type SubscriptionStanding =
  | 'current'
  | 'past_due'
  | 'trial_ended'
  | 'ended'

export function getSubscriptionStanding(
  subscription: SubscriptionForPlan | null,
  now = new Date()
): SubscriptionStanding | null {
  if (!subscription) return null
  if (getCurrentPlan(subscription, now)) return 'current'
  if (subscription.status === 'past_due') return 'past_due'
  if (subscription.status === 'trialing') return 'trial_ended'
  return 'ended'
}
