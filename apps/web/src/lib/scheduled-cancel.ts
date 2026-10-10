import type { SubscriptionStanding } from '@findsports_oficial/api/lib/current-plan'

type CancellableSubscription =
  | {
      standing: SubscriptionStanding | null
      cancelAt: string | Date | null
    }
  | null
  | undefined

/**
 * Cancelamento agendado no portal do Stripe (WEB-335): quando a assinatura
 * acaba, ou `null`. Só vale com o plano em vigor: plano parado e assinatura
 * encerrada têm o próprio aviso, e ali a data já não é um agendamento.
 */
export function getScheduledCancelAt(
  subscription: CancellableSubscription
): Date | null {
  if (subscription?.standing !== 'current' || !subscription.cancelAt) {
    return null
  }
  return new Date(subscription.cancelAt)
}

/**
 * Assinatura que o portal abre direto no cancelamento (WEB-339): viva no
 * Stripe e sem fim agendado. Teste do cadastro não tem o que cancelar lá;
 * plano parado e assinatura encerrada a rota do plugin recusa (só `active` e
 * `trialing`); com o fim agendado, a ação é reativar.
 */
export function canCancelSubscription(
  subscription:
    | (NonNullable<CancellableSubscription> & {
        externalSubscriptionId: string | null
      })
    | null
    | undefined
): boolean {
  return (
    subscription?.standing === 'current' &&
    subscription.externalSubscriptionId !== null &&
    !subscription.cancelAt
  )
}

/** O dia do cancelamento agendado, `DD/MM`: o do aviso e o do cabeçalho de `/plan`. */
export function getCancelDay(
  subscription: CancellableSubscription
): string | null {
  const cancelAt = getScheduledCancelAt(subscription)
  if (!cancelAt) return null
  return cancelAt.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit'
  })
}

/**
 * O aviso que entra no lugar de "Próxima cobrança em …" — o mesmo texto em
 * `/admin/billing` e em `/plan`. Sem ponto final: quem usa pontua.
 */
export function getCancelNotice(
  subscription: CancellableSubscription
): string | null {
  const day = getCancelDay(subscription)
  return day ? `Cancela em ${day} — o plano segue até lá` : null
}
