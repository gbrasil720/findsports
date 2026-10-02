import { inDays, type Plan } from './pubs'

/**
 * Corpos de webhook de assinatura da Dodo, válidos para o `SubscriptionSchema`
 * do `@dodopayments/core` (o plugin recusa com 400 o que não passa). Use com
 * `sendDodoWebhook` de `fixtures/dodo.ts`.
 *
 * Os handlers do app (`packages/auth/src/index.ts`) leem `customer.email`,
 * `customer.customer_id`, `subscription_id`, `product_id` e
 * `next_billing_date`; o resto é o mínimo que o esquema exige.
 */

export type SubscriptionEvent =
  | 'subscription.active'
  | 'subscription.renewed'
  | 'subscription.on_hold'
  | 'subscription.failed'
  | 'subscription.cancelled'

/** Os mesmos ids do `checkout()` em `packages/auth/src/index.ts`. */
export const PRODUCT_ID: Record<Plan, string> = {
  starter: 'pdt_0NgxgZyV3AKsNe99Ae2ZN',
  pro: 'pdt_0NgxglMLDZdpaXIuRAiCE',
  elite: 'pdt_0NgxgzP6hnGWg1brokOcU'
}

const STATUS: Record<SubscriptionEvent, string> = {
  'subscription.active': 'active',
  'subscription.renewed': 'active',
  'subscription.on_hold': 'on_hold',
  'subscription.failed': 'failed',
  'subscription.cancelled': 'cancelled'
}

export function subscriptionWebhook(
  type: SubscriptionEvent,
  options: {
    email: string
    subscriptionId: string
    plan: Plan
    nextBillingDate?: Date
  }
) {
  const now = new Date().toISOString()
  const next = options.nextBillingDate ?? inDays(30)
  return {
    business_id: 'bus_e2e',
    type,
    timestamp: now,
    data: {
      payload_type: 'Subscription',
      addons: [],
      billing: {
        city: null,
        country: 'BR',
        state: null,
        street: null,
        zipcode: null
      },
      cancel_at_next_billing_date: false,
      cancelled_at: type === 'subscription.cancelled' ? now : null,
      created_at: now,
      currency: 'BRL',
      customer: {
        // O app grava o primeiro customer do usuário e recusa outro depois:
        // derivado do e-mail, fica estável entre webhooks.
        customer_id: `cus_e2e_wh_${options.email}`,
        email: options.email,
        metadata: {},
        name: options.email,
        phone_number: null
      },
      custom_field_responses: null,
      discount_cycles_remaining: null,
      discount_id: null,
      expires_at: null,
      credit_entitlement_cart: [],
      meter_credit_entitlement_cart: [],
      meters: [],
      metadata: {},
      next_billing_date: next.toISOString(),
      on_demand: false,
      payment_frequency_count: 1,
      payment_frequency_interval: 'Month',
      payment_method_id: null,
      previous_billing_date: now,
      product_id: PRODUCT_ID[options.plan],
      quantity: 1,
      recurring_pre_tax_amount: 9900,
      status: STATUS[type],
      subscription_id: options.subscriptionId,
      subscription_period_count: 12,
      subscription_period_interval: 'Month',
      tax_id: null,
      tax_inclusive: true,
      trial_period_days: 0
    }
  }
}
