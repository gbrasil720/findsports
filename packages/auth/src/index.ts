import {
  checkout,
  dodopayments,
  portal,
  webhooks
} from '@dodopayments/better-auth'
import { createDb, db, eq } from '@findsports_oficial/db'
import * as schema from '@findsports_oficial/db/schema/auth'
import { user } from '@findsports_oficial/db/schema/auth'
import { bar, subscription } from '@findsports_oficial/db/schema/platform'
import { env } from '@findsports_oficial/env/server'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { tanstackStartCookies } from 'better-auth/tanstack-start'
import DodoPayments from 'dodopayments'

export const dodoClient = new DodoPayments({
  bearerToken: process.env.DODO_PAYMENTS_API_KEY!,
  environment: process.env.NODE_ENV === 'production' ? 'live_mode' : 'test_mode'
})

const PLAN_BY_PRODUCT: Record<string, 'starter' | 'pro' | 'elite'> = {
  pdt_0NgxgZyV3AKsNe99Ae2ZN: 'starter',
  pdt_0NgxglMLDZdpaXIuRAiCE: 'pro',
  pdt_0NgxgzP6hnGWg1brokOcU: 'elite'
}

// Busca o bar pelo email do customer no payload
async function getBarByCustomerEmail(email: string) {
  const foundUser = await db.query.user.findFirst({
    where: eq(user.email, email)
  })
  if (!foundUser) return null

  return db.query.bar.findFirst({
    where: eq(bar.userId, foundUser.id)
  })
}

async function handleSubscriptionActivated(payload: any) {
  const data = payload.data ?? payload
  const email = data?.customer?.email
  const dodoSubId = data?.subscription_id
  const productId = data?.product_id
  const plan = productId ? PLAN_BY_PRODUCT[productId] : 'starter'

  if (!email || !dodoSubId) return

  const foundBar = await getBarByCustomerEmail(email)
  if (!foundBar) return

  // Verifica se já existe subscription para esse bar
  const existing = await db.query.subscription.findFirst({
    where: eq(subscription.barId, foundBar.id)
  })

  if (existing) {
    // Atualiza a subscription existente
    await db
      .update(subscription)
      .set({
        status: 'active',
        plan: plan ?? 'starter',
        dodoSubscriptionId: dodoSubId,
        currentPeriodEnd: data?.next_billing_date
          ? new Date(data.next_billing_date)
          : undefined
      })
      .where(eq(subscription.barId, foundBar.id))
  } else {
    // Cria nova subscription
    await db.insert(subscription).values({
      barId: foundBar.id,
      status: 'active',
      plan: plan ?? 'starter',
      dodoSubscriptionId: dodoSubId,
      currentPeriodEnd: data?.next_billing_date
        ? new Date(data.next_billing_date)
        : undefined
    })
  }

  // Ativa o bar
  await db.update(bar).set({ isActive: true }).where(eq(bar.id, foundBar.id))
}

async function handleSubscriptionOnHold(payload: any) {
  const data = payload.data ?? payload
  const dodoSubId = data?.subscription_id
  if (!dodoSubId) return

  const existing = await db.query.subscription.findFirst({
    where: eq(subscription.dodoSubscriptionId, dodoSubId)
  })
  if (!existing) return

  await db
    .update(subscription)
    .set({ status: 'past_due' })
    .where(eq(subscription.barId, existing.barId))
  // Janela de 5 dias — bar continua ativo até subscription.cancelled
}

async function handleSubscriptionCancelled(payload: any) {
  const data = payload.data ?? payload
  const dodoSubId = data?.subscription_id
  if (!dodoSubId) return

  const existing = await db.query.subscription.findFirst({
    where: eq(subscription.dodoSubscriptionId, dodoSubId)
  })
  if (!existing) return

  await db
    .update(subscription)
    .set({ status: 'inactive' })
    .where(eq(subscription.barId, existing.barId))

  await db
    .update(bar)
    .set({ isActive: false })
    .where(eq(bar.id, existing.barId))
}

export function createAuth() {
  const db = createDb()

  return betterAuth({
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema: schema
    }),
    trustedOrigins: [env.CORS_ORIGIN],
    emailAndPassword: {
      enabled: true,
      autoSignIn: true,
      requireEmailVerification: false
    },
    user: {
      additionalFields: {
        role: {
          type: 'string',
          required: true,
          defaultValue: 'fan',
          input: true
        },
        onboardingCompleted: {
          type: 'boolean',
          required: false,
          defaultValue: false,
          input: false
        },
        searchRadiusKm: {
          type: 'number',
          required: false,
          defaultValue: 3,
          input: true
        }
      }
    },
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    plugins: [
      tanstackStartCookies(),
      dodopayments({
        client: dodoClient,
        createCustomerOnSignUp: true,
        use: [
          checkout({
            products: [
              { productId: 'pdt_0NgxgZyV3AKsNe99Ae2ZN', slug: 'starter' },
              { productId: 'pdt_0NgxglMLDZdpaXIuRAiCE', slug: 'pro' },
              { productId: 'pdt_0NgxgzP6hnGWg1brokOcU', slug: 'elite' }
            ],
            successUrl: '/admin',
            authenticatedUsersOnly: true
          }),
          portal(),
          webhooks({
            webhookKey: process.env.DODO_PAYMENTS_WEBHOOK_SECRET!,
            onSubscriptionActive: handleSubscriptionActivated,
            onSubscriptionRenewed: handleSubscriptionActivated,
            onSubscriptionOnHold: handleSubscriptionOnHold,
            onSubscriptionFailed: handleSubscriptionOnHold,
            onSubscriptionCancelled: handleSubscriptionCancelled
          })
        ]
      })
    ]
  })
}

export const auth = createAuth()
