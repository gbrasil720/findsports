type SubscriptionForDeletion = {
  externalSubscriptionId: string | null
  status: 'trialing' | 'active' | 'inactive' | 'past_due' | 'cancelled'
}

/**
 * Id da assinatura que ainda pode cobrar no Stripe, ou `null`. Excluir a
 * conta a encerra na hora, antes de apagar o dono (WEB-336): apagar a conta
 * com ela viva deixaria a cobrança órfã. Cancelamento marcado para o fim do
 * período segue `active` no Stripe até lá, e entra aqui.
 *
 * `cancelled` não tem o que encerrar, mesmo com `currentPeriodEnd` no futuro
 * (WEB-60): quando o `canceled` chega, a assinatura já acabou no Stripe.
 *
 * `inactive` (assinatura `paused` no Stripe) também não: pausada, ela não
 * gera fatura, e só volta a cobrar se o cliente puser um meio de pagamento e
 * a assinatura for retomada.
 */
export function liveStripeSubscriptionId(
  subscription: SubscriptionForDeletion | null
): string | null {
  if (!subscription?.externalSubscriptionId) return null
  if (
    subscription.status === 'active' ||
    subscription.status === 'trialing' ||
    subscription.status === 'past_due'
  ) {
    return subscription.externalSubscriptionId
  }
  return null
}
