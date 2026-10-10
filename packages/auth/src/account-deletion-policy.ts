type SubscriptionForDeletion = {
  externalSubscriptionId: string | null
  status: 'trialing' | 'active' | 'inactive' | 'past_due' | 'cancelled'
}

/**
 * Id da assinatura que ainda existe no Stripe, ou `null`. Excluir a conta a
 * encerra na hora, antes de apagar o dono (WEB-336): apagar a conta com ela
 * viva deixaria a cobrança órfã. Cancelamento marcado para o fim do período
 * segue `active` no Stripe até lá, e entra aqui.
 *
 * `inactive` (assinatura `paused` no Stripe) também entra: pausada ela não
 * gera fatura, mas continua existindo lá, e sem o dono não sobra quem possa
 * retomá-la ou encerrá-la.
 *
 * `cancelled` não tem o que encerrar, mesmo com `currentPeriodEnd` no futuro
 * (WEB-60): quando o `canceled` chega, a assinatura já acabou no Stripe.
 */
export function liveStripeSubscriptionId(
  subscription: SubscriptionForDeletion | null
): string | null {
  if (!subscription?.externalSubscriptionId) return null
  return subscription.status === 'cancelled'
    ? null
    : subscription.externalSubscriptionId
}
