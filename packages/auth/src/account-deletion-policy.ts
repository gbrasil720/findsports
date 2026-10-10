type SubscriptionForDeletion = {
  externalSubscriptionId: string | null
  status: 'trialing' | 'active' | 'inactive' | 'past_due' | 'cancelled'
}

export type BarAccountDeletionBlock = 'subscription-active'

/**
 * Bloqueia a exclusão enquanto a assinatura no Stripe ainda pode cobrar:
 * apagar a conta deixaria a cobrança órfã.
 *
 * `cancelled` libera na hora, mesmo com `currentPeriodEnd` no futuro (WEB-60).
 * No Stripe, cancelamento marcado para o fim do período segue `active` até
 * lá, e cai no bloqueio acima; quando o `canceled` chega, a assinatura já
 * acabou, o bar já saiu do ar e não há mais o que cobrar. Período no futuro
 * só sobra no cancelamento imediato, que encerra o serviço na hora.
 *
 * `inactive` (assinatura `paused` no Stripe) também libera: pausada, ela não
 * gera fatura, e só volta a cobrar se o cliente puser um meio de pagamento e
 * a assinatura for retomada.
 */
export function getBarAccountDeletionBlock(
  subscription: SubscriptionForDeletion | null
): BarAccountDeletionBlock | null {
  if (!subscription?.externalSubscriptionId) return null
  if (
    subscription.status === 'active' ||
    subscription.status === 'trialing' ||
    subscription.status === 'past_due'
  ) {
    return 'subscription-active'
  }
  return null
}
