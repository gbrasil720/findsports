import type { stripeClient } from '@findsports_oficial/auth/stripe-client'
import { logBillingError } from '@findsports_oficial/auth/stripe-sync'

type StripeReader = Pick<typeof stripeClient, 'invoices' | 'charges'>
type StripeInvoice = Awaited<
  ReturnType<StripeReader['invoices']['list']>
>['data'][number]

// Como o saldo (WEB-350): a página não espera o Stripe mais de 5s.
const REQUEST = { timeout: 5000, maxNetworkRetries: 0 }

/** Um ano de mensalidades. Mais antigas ficam no portal do Stripe. */
const INVOICE_LIMIT = 12

export type BillingInvoice = {
  id: string
  /** Emissão da fatura: é o mês dela na lista. */
  createdAt: Date
  /** Total em reais, com o desconto e antes do crédito do cliente. */
  amountReais: number
  /**
   * `trial`: a fatura de R$ 0 que o Stripe emite ao abrir uma assinatura em
   * teste. `pending`: emitida e não paga (cartão recusado, à espera).
   */
  situation: 'paid' | 'trial' | 'pending'
  paidAt: Date | null
  /** Última cobrança recusada desta fatura; só em `pending`. */
  failedAt: Date | null
  /** Fim do teste grátis que a fatura cobre; só em `trial`. */
  trialEndsAt: Date | null
  /** PDF da fatura, servido pelo Stripe. */
  pdfUrl: string | null
}

export type BillingInvoices = {
  invoices: BillingInvoice[]
  /** Cobrança recusada da fatura pendente mais recente (3s). */
  lastFailedChargeAt: Date | null
}

const fromUnix = (seconds: number | null | undefined) =>
  seconds ? new Date(seconds * 1000) : null

function situationOf(
  invoice: StripeInvoice
): BillingInvoice['situation'] | null {
  if (invoice.status === 'paid') return invoice.total === 0 ? 'trial' : 'paid'
  if (invoice.status === 'open' || invoice.status === 'uncollectible') {
    return 'pending'
  }
  // Rascunho ainda não é fatura; anulada não é cobrança.
  return null
}

function failed(step: 'invoices' | 'charges', subscriptionId: string) {
  return (error: unknown) => {
    logBillingError('stripe_billing_invoices_failed', {
      step,
      subscriptionId,
      message: error instanceof Error ? error.message : String(error)
    })
    return null
  }
}

/**
 * Faturas da assinatura no Stripe, da mais nova para a mais antiga (WEB-443),
 * e a data da cobrança recusada de cada uma que está pendente.
 *
 * O Stripe não guarda na fatura quando o cartão foi recusado: a data vem da
 * última cobrança falha do cliente emitida depois da fatura. Essa leitura só
 * acontece com fatura pendente já tentada, e falhar nela só tira a data.
 *
 * Só leitura. Sem assinatura no Stripe não há chamada (`null`); erro do
 * Stripe na lista também é `null`, e nenhum erro sai daqui.
 */
export async function readInvoices(
  client: StripeReader,
  subscriptionId: string | null | undefined
): Promise<BillingInvoices | null> {
  if (!subscriptionId) return null

  const list = await client.invoices
    .list({ subscription: subscriptionId, limit: INVOICE_LIMIT }, REQUEST)
    .catch(failed('invoices', subscriptionId))
  if (!list) return null

  const shown = list.data.flatMap((invoice) => {
    const situation = situationOf(invoice)
    return situation ? [{ invoice, situation }] : []
  })

  const attempted = shown.find(
    ({ invoice, situation }) =>
      situation === 'pending' && invoice.attempt_count > 0
  )?.invoice
  const customer =
    typeof attempted?.customer === 'string'
      ? attempted.customer
      : attempted?.customer?.id
  const charges = customer
    ? await client.charges
        .list({ customer, limit: 10 }, REQUEST)
        .catch(failed('charges', subscriptionId))
    : null

  const invoices = shown.map(({ invoice, situation }): BillingInvoice => {
    // A lista vem da mais nova para a mais antiga.
    const failedCharge =
      situation === 'pending'
        ? charges?.data.find(
            (charge) =>
              charge.status === 'failed' && charge.created >= invoice.created
          )
        : undefined
    return {
      id: invoice.id ?? '',
      createdAt: new Date(invoice.created * 1000),
      amountReais: invoice.total / 100,
      situation,
      paidAt: fromUnix(invoice.status_transitions?.paid_at),
      failedAt: fromUnix(failedCharge?.created),
      trialEndsAt:
        situation === 'trial'
          ? fromUnix(invoice.lines?.data[0]?.period?.end)
          : null,
      pdfUrl: invoice.invoice_pdf ?? null
    }
  })

  return {
    invoices,
    lastFailedChargeAt:
      invoices.find((invoice) => invoice.situation === 'pending')?.failedAt ??
      null
  }
}
