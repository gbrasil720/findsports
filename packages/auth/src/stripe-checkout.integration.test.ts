import { afterAll, expect, test } from 'bun:test'
import { isDisposableTestDatabase } from '@findsports_oficial/db/utils/db-resolver'
import type Stripe from 'stripe'

const integrationTest = isDisposableTestDatabase() ? test : test.skip

// Parâmetros da sessão de checkout no mensal e no anual (WEB-442): o cupom de
// fundador é só do mensal, e o teste do cadastro vale nos dois.

async function setup() {
  const [{ db, inArray }, { user }, { bar, subscription }, checkout] =
    await Promise.all([
      import('@findsports_oficial/db'),
      import('@findsports_oficial/db/schema/auth'),
      import('@findsports_oficial/db/schema/platform'),
      import('./stripe-checkout')
    ])
  const userIds: string[] = []

  async function createTrialBar(currentPeriodEnd: Date) {
    const userId = crypto.randomUUID()
    const barId = crypto.randomUUID()
    await db.insert(user).values({
      id: userId,
      name: 'Dono WEB-442',
      email: `${userId}@integration.invalid`,
      emailVerified: true,
      role: 'pub'
    })
    userIds.push(userId)
    await db.insert(bar).values({
      id: barId,
      userId,
      name: 'Bar do anual',
      address: 'Rua descartável, 1',
      neighborhood: 'Teste',
      city: 'Teste',
      latitude: '-35.75000000',
      longitude: '-37.25000000',
      isActive: true
    })
    await db
      .insert(subscription)
      .values({ barId, status: 'trialing', plan: 'pro', currentPeriodEnd })
    return { id: userId, name: 'Dono WEB-442' }
  }

  async function cleanup() {
    if (userIds.length > 0) {
      await db.delete(user).where(inArray(user.id, userIds))
    }
  }

  return { ...checkout, createTrialBar, cleanup }
}

const context = isDisposableTestDatabase() ? await setup() : null
function ready() {
  if (!context) throw new Error('banco descartável indisponível')
  return context
}
afterAll(async () => {
  await context?.cleanup()
})

/** Stripe com o cupom de fundador valendo; conta quantas vezes foi consultado. */
function stripeWithCoupon() {
  let couponReads = 0
  const client = {
    coupons: {
      retrieve: async () => {
        couponReads += 1
        return { valid: true }
      }
    }
  } as unknown as Stripe
  return { client, couponReads: () => couponReads }
}

integrationTest(
  'mensal no teste grátis: cupom de fundador e primeira cobrança no fim do teste',
  async () => {
    const { checkoutParamsFor, createTrialBar, FOUNDER_COUPON_ID } = ready()
    const trialEnd = new Date(Date.now() + 30 * 24 * 3_600_000)
    const owner = await createTrialBar(trialEnd)
    const stripe = stripeWithCoupon()

    const params = await checkoutParamsFor(owner, null, stripe.client)

    expect(params.discounts).toEqual([{ coupon: FOUNDER_COUPON_ID }])
    expect(params.allow_promotion_codes).toBeUndefined()
    expect(params.subscription_data).toEqual({
      trial_end: Math.floor(trialEnd.getTime() / 1000)
    })
  }
)

integrationTest(
  'anual no teste grátis: sem cupom de fundador, com a mesma primeira cobrança',
  async () => {
    const { checkoutParamsFor, createTrialBar } = ready()
    const trialEnd = new Date(Date.now() + 30 * 24 * 3_600_000)
    const owner = await createTrialBar(trialEnd)
    const stripe = stripeWithCoupon()

    const params = await checkoutParamsFor(owner, null, stripe.client, {
      annual: true
    })

    expect(params.discounts).toBeUndefined()
    expect(params.allow_promotion_codes).toBeUndefined()
    // O anual nem pergunta do cupom ao Stripe.
    expect(stripe.couponReads()).toBe(0)
    expect(params.subscription_data).toEqual({
      trial_end: Math.floor(trialEnd.getTime() / 1000)
    })
  }
)
