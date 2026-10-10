import type { stripeClient } from '@findsports_oficial/auth/stripe-client'
import { logBillingError } from '@findsports_oficial/auth/stripe-sync'

type StripeReader = Pick<typeof stripeClient, 'subscriptions' | 'invoices'>

// A página não espera o Stripe: sem resposta em 5s, segue sem o saldo.
const REQUEST = { timeout: 5000, maxNetworkRetries: 0 }

export type BillingBalance = {
  /** Crédito do cliente no Stripe, em reais. `null`: sem crédito ou sem resposta. */
  creditReais: number | null
  /** Valor da próxima fatura em reais, com o crédito já abatido. */
  nextChargeReais: number | null
  /**
   * Cartão que a assinatura cobra. Só bandeira e últimos 4 dígitos saem
   * daqui. `null`: sem cartão ou sem resposta.
   */
  card: { brand: string; last4: string } | null
}

function failed(step: 'customer' | 'preview', subscriptionId: string) {
  return (error: unknown) => {
    // Assinatura com cancelamento marcado não tem próxima fatura: é resposta
    // esperada do Stripe, não falha.
    if ((error as { code?: string } | null)?.code !== 'invoice_upcoming_none') {
      logBillingError('stripe_billing_balance_failed', {
        step,
        subscriptionId,
        message: error instanceof Error ? error.message : String(error)
      })
    }
    return null
  }
}

/**
 * Saldo do cliente e prévia da próxima fatura, lidos do Stripe (WEB-350). O
 * crédito proporcional de um downgrade fica no saldo do cliente e abate as
 * faturas seguintes; sem isto o app mostrava só a data da cobrança.
 *
 * Na mesma leitura vem o cartão: o da assinatura (é onde o checkout o grava)
 * e, sem ele, o padrão do cliente — a ordem em que o Stripe cobra.
 *
 * Só leitura. No Stripe crédito é saldo negativo, em centavos. Sem assinatura
 * no Stripe não há chamada, e as duas leituras falham sozinhas: erro em uma
 * não esconde a outra, e nenhum erro sai daqui.
 */
export async function readBillingBalance(
  client: StripeReader,
  subscriptionId: string | null | undefined
): Promise<BillingBalance | null> {
  if (!subscriptionId) return null

  const [subscription, preview] = await Promise.all([
    client.subscriptions
      .retrieve(
        subscriptionId,
        {
          expand: [
            'default_payment_method',
            'customer.invoice_settings.default_payment_method'
          ]
        },
        REQUEST
      )
      .catch(failed('customer', subscriptionId)),
    client.invoices
      .createPreview({ subscription: subscriptionId }, REQUEST)
      .catch(failed('preview', subscriptionId))
  ])

  const customer = subscription?.customer
  const account =
    customer && typeof customer === 'object' && 'balance' in customer
      ? customer
      : null
  const balance = account?.balance ?? 0
  const method =
    subscription?.default_payment_method ??
    account?.invoice_settings?.default_payment_method
  const card = method && typeof method === 'object' ? method.card : null

  return {
    creditReais: balance < 0 ? -balance / 100 : null,
    nextChargeReais: preview ? preview.amount_due / 100 : null,
    card: card ? { brand: card.brand, last4: card.last4 } : null
  }
}
