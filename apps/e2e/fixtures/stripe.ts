import { createHmac, randomUUID } from 'node:crypto'
import type { APIRequestContext } from '@playwright/test'
import { STRIPE_WEBHOOK_SECRET, STUB_URL } from '../env'
import { inDays, type Plan } from './pubs'

export const LOOKUP_KEY: Record<Plan, string> = {
  starter: 'starter_monthly',
  pro: 'pro_monthly',
  elite: 'elite_monthly'
}

type StripeStatus =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'unpaid'
  | 'canceled'
  | 'incomplete'

/**
 * Assinatura como a API do Stripe devolve, só com o que o app lê: situação,
 * dono (`metadata.userId`, gravado pelo nosso checkout), preço e fim do
 * período. `lookupKey` por cima do plano serve para o preço desconhecido.
 */
export function stripeSubscription(options: {
  id: string
  status: StripeStatus
  plan: Plan
  userId: string
  currentPeriodEnd?: Date
  lookupKey?: string
  /** Cliente no Stripe; por padrão um que não é de ninguém no nosso banco. */
  customerId?: string
}) {
  const lookupKey = options.lookupKey ?? LOOKUP_KEY[options.plan]
  return {
    id: options.id,
    object: 'subscription',
    status: options.status,
    customer: options.customerId ?? `cus_e2e_wh_${options.userId}`,
    metadata: { userId: options.userId },
    cancel_at_period_end: false,
    items: {
      object: 'list',
      data: [
        {
          id: `si_e2e_${options.id}`,
          quantity: 1,
          current_period_start: Math.floor(Date.now() / 1000),
          current_period_end: Math.floor(
            (options.currentPeriodEnd ?? inDays(30)).getTime() / 1000
          ),
          price: {
            id: `price_e2e_${lookupKey}`,
            lookup_key: lookupKey,
            recurring: { interval: 'month' }
          }
        }
      ]
    }
  }
}

type SubscriptionEvent =
  | 'customer.subscription.created'
  | 'customer.subscription.updated'
  | 'customer.subscription.deleted'

/**
 * Entrega um webhook do Stripe assinado como o Stripe assina: cabeçalho
 * `stripe-signature: t=<segundos>,v1=<HMAC-SHA256 de "t.corpo">`. O servidor
 * de E2E tem o mesmo segredo, então o plugin aceita.
 *
 * Mande com o `request` sem sessão: com cookie, o better-auth exige `Origin`.
 */
export async function sendStripeWebhook(
  request: APIRequestContext,
  event: unknown,
  { secret = STRIPE_WEBHOOK_SECRET }: { secret?: string } = {}
) {
  const body = JSON.stringify(event)
  const timestamp = Math.floor(Date.now() / 1000)
  const signature = createHmac('sha256', secret)
    .update(`${timestamp}.${body}`)
    .digest('hex')

  return request.post('/api/auth/stripe/webhook', {
    data: body,
    headers: {
      'content-type': 'application/json',
      'stripe-signature': `t=${timestamp},v1=${signature}`
    }
  })
}

/**
 * Põe a assinatura no "Stripe" (o stub) e entrega o evento dela. As duas
 * coisas, porque o app não confia no corpo do evento: ele busca no Stripe o
 * estado atual da assinatura e grava esse.
 */
export async function deliverSubscription(
  request: APIRequestContext,
  type: SubscriptionEvent,
  subscription: ReturnType<typeof stripeSubscription>
) {
  const seeded = await request.post(`${STUB_URL}/stripe/subscriptions`, {
    data: subscription
  })
  if (!seeded.ok()) throw new Error('stub do Stripe recusou a assinatura')
  return sendStripeWebhook(request, {
    id: `evt_e2e_${randomUUID()}`,
    object: 'event',
    type,
    data: { object: subscription }
  })
}
