import type { subscription } from '@findsports_oficial/db/schema/platform'

export type SubscriptionForPlan = Pick<
  typeof subscription.$inferSelect,
  'plan' | 'status' | 'currentPeriodEnd'
>

/**
 * Plano que a assinatura dá direito agora, ou `null` sem benefício vigente.
 *
 * `bar.plan` projeta esta mesma regra para a ordenação da busca (função
 * `subscription_current_plan`, migration 0050), mas só acompanha o relógio
 * uma vez por dia: um trial vencido pode seguir lá por até 24 horas
 * (`reconcileBarPlans`). Recurso pago decide por aqui.
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

/**
 * Assinatura que o portal abre direto no cancelamento (WEB-339): viva no
 * Stripe e sem fim agendado. Teste do cadastro não tem o que cancelar lá;
 * plano parado e assinatura encerrada o servidor recusa
 * (`pub.openSubscriptionCancel`); com o fim agendado, a ação é reativar. A
 * tela e o servidor decidem por aqui.
 */
export function canCancelSubscription(
  subscription:
    | {
        standing: SubscriptionStanding | null
        externalSubscriptionId: string | null
        cancelAt: string | Date | null
      }
    | null
    | undefined
): boolean {
  return (
    subscription?.standing === 'current' &&
    subscription.externalSubscriptionId !== null &&
    !subscription.cancelAt
  )
}
