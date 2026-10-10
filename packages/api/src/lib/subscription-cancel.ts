import { QUICK_REQUEST } from '@findsports_oficial/auth/stripe-checkout'
import type { stripeClient } from '@findsports_oficial/auth/stripe-client'
import { logBillingError } from '@findsports_oficial/auth/stripe-sync'
import { TRPCError } from '@trpc/server'

type StripePortal = Pick<typeof stripeClient, 'subscriptions' | 'billingPortal'>

/**
 * Sessão do portal do Stripe já no cancelamento da assinatura (WEB-339), em
 * português. Devolve a URL.
 *
 * No lugar da rota do plugin (`/subscription/cancel`): ela apaga a linha de
 * `stripe_subscription` quando o Stripe diz que a assinatura não está `active`
 * nem `trialing`, e sem a linha o plugin deixa de reconhecer a assinatura — a
 * troca de plano seguinte poderia abrir um segundo checkout. Aqui nada é
 * gravado: Stripe recusando, demorando ou com a assinatura em outra situação,
 * sai erro e o banco fica como estava.
 */
export async function createSubscriptionCancelUrl(
  client: StripePortal,
  subscriptionId: string,
  returnUrl: string
): Promise<string> {
  try {
    const current = await client.subscriptions.retrieve(
      subscriptionId,
      {},
      QUICK_REQUEST
    )
    if (current.status !== 'active' && current.status !== 'trialing') {
      throw new Error(`assinatura ${current.status} no Stripe`)
    }
    const session = await client.billingPortal.sessions.create(
      {
        customer:
          typeof current.customer === 'string'
            ? current.customer
            : current.customer.id,
        locale: 'pt-BR',
        return_url: returnUrl,
        flow_data: {
          type: 'subscription_cancel',
          subscription_cancel: { subscription: subscriptionId }
        }
      },
      QUICK_REQUEST
    )
    return session.url
  } catch (error) {
    logBillingError('stripe_subscription_cancel_portal_failed', {
      subscriptionId,
      message: error instanceof Error ? error.message : String(error)
    })
    throw new TRPCError({
      code: 'SERVICE_UNAVAILABLE',
      message:
        'Não foi possível abrir o cancelamento agora. Tente de novo em instantes.'
    })
  }
}
