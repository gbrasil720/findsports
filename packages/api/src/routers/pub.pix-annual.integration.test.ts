import { afterAll, beforeAll, expect, spyOn, test } from 'bun:test'
import { applyPixSubscription } from '@findsports_oficial/auth/pix-sync'
import { stripeClient } from '@findsports_oficial/auth/stripe-client'
import { eq } from '@findsports_oficial/db'
import { subscription } from '@findsports_oficial/db/schema/platform'
import { isDisposableTestDatabase } from '@findsports_oficial/db/utils/db-resolver'
import { env } from '@findsports_oficial/env/server'
import { refusal, seedBar } from './integration-seed'

/**
 * Pix anual: o checkout pede o produto do ano e marca o `externalId`, o
 * webhook grava o intervalo e o desconto do ano, e a escolha no teste do
 * cadastro guarda o anual. A AbacatePay é um dublê do `fetch`.
 */

const integrationTest = isDisposableTestDatabase() ? test : test.skip
const DAY = 24 * 3_600_000

const abacate = {
  products: [] as string[],
  checkouts: [] as {
    externalId: string
    items: { id: string; quantity: number }[]
  }[],
  subs: new Map<string, { status: string; currentPeriodEnd: string }>()
}
const realFetch = globalThis.fetch
const reply = (data: unknown, status = 200, error: string | null = null) =>
  Response.json({ data, error }, { status })
const secrets = env as { ABACATE_PAY_WEBHOOK_SECRET?: string }
const previousSecret = secrets.ABACATE_PAY_WEBHOOK_SECRET

beforeAll(() => {
  // Com a chave do `.env.test` e este segredo, o Pix aparece (`pixEnabled`).
  secrets.ABACATE_PAY_WEBHOOK_SECRET = 'segredo-de-teste-do-webhook-do-pix-0000'
  globalThis.fetch = (async (
    input: string | URL | Request,
    init?: RequestInit
  ) => {
    const url = new URL(String(input instanceof Request ? input.url : input))
    if (url.hostname !== 'api.abacatepay.com') return realFetch(input, init)
    const path = url.pathname.replace('/v2', '')
    const body = init?.body ? JSON.parse(String(init.body)) : null
    if (path === '/products/get') {
      const ext = url.searchParams.get('externalId') ?? ''
      abacate.products.push(ext)
      return reply({ id: `prod_${ext}` })
    }
    if (path === '/customers/create') return reply({ id: 'cust_1' })
    if (path === '/subscriptions/create') {
      abacate.checkouts.push(body)
      return reply({
        id: `bill_${abacate.checkouts.length}`,
        url: 'https://pay.test/bill',
        externalId: body.externalId,
        status: 'PENDING'
      })
    }
    if (path === '/subscriptions/checkouts/delete') return reply({})
    if (path === '/subscriptions/get') {
      const id = url.searchParams.get('id') ?? ''
      const sub = abacate.subs.get(id)
      return sub
        ? reply({ id, ...sub, createdAt: new Date().toISOString() })
        : reply(null, 404, 'Subscription not found')
    }
    return reply(null, 404, `rota não dublada: ${path}`)
  }) as typeof fetch
})

afterAll(() => {
  globalThis.fetch = realFetch
  secrets.ABACATE_PAY_WEBHOOK_SECRET = previousSecret
})

/** Vagas de fundador sobrando, sem ir ao Stripe. */
function founderSeats() {
  return spyOn(stripeClient.coupons, 'retrieve').mockImplementation((async (
    id: string
  ) =>
    id === 'fundador_anual'
      ? { times_redeemed: 0 }
      : { valid: true, max_redemptions: 100, times_redeemed: 0 }) as never)
}

integrationTest(
  'no teste do cadastro: o Pix anual escolhido fica guardado para o fim do teste',
  async () => {
    const ctx = await seedBar(
      'pro',
      'trialing',
      new Date(Date.now() + 20 * DAY)
    )
    try {
      await ctx.owner.pub.schedulePixAfterTrial({ plan: 'elite', annual: true })
      const [row] = await ctx.db
        .select({
          plan: subscription.plan,
          billingInterval: subscription.billingInterval
        })
        .from(subscription)
        .where(eq(subscription.barId, ctx.barId))
      expect(row).toEqual({ plan: 'elite', billingInterval: 'year' })
      expect((await ctx.owner.pub.getMySubscription())?.billingInterval).toBe(
        'year'
      )
    } finally {
      await ctx.cleanup()
    }
  }
)

integrationTest(
  'checkout do Pix anual: produto do ano e externalId com o anual; o webhook grava o ano',
  async () => {
    const ctx = await seedBar(
      'pro',
      'trialing',
      new Date(Date.now() + 20 * DAY)
    )
    const seats = founderSeats()
    try {
      await ctx.owner.pub.startPixCheckout({ plan: 'elite', annual: true })
      expect(abacate.products.at(-1)).toBe('elite_founder_yearly')
      const checkout = abacate.checkouts.at(-1)
      expect(checkout?.items).toEqual([
        { id: 'prod_elite_founder_yearly', quantity: 1 }
      ])
      expect(checkout?.externalId.endsWith(':y')).toBe(true)

      // A autorização paga: o ciclo vai um ano à frente.
      const paidUntil = new Date(Date.now() + 365 * DAY)
      abacate.subs.set('subs_anual', {
        status: 'ACTIVE',
        currentPeriodEnd: paidUntil.toISOString()
      })
      await applyPixSubscription(
        'subs_anual',
        checkout?.externalId,
        'subscription.completed'
      )
      const [row] = await ctx.db
        .select({
          status: subscription.status,
          plan: subscription.plan,
          provider: subscription.provider,
          billingInterval: subscription.billingInterval,
          monthlyDiscountReais: subscription.monthlyDiscountReais,
          currentPeriodEnd: subscription.currentPeriodEnd
        })
        .from(subscription)
        .where(eq(subscription.barId, ctx.barId))
      expect(row).toEqual({
        status: 'active',
        plan: 'elite',
        provider: 'abacatepay',
        billingInterval: 'year',
        monthlyDiscountReais: 280,
        currentPeriodEnd: paidUntil
      })
      expect((await ctx.owner.pub.getMySubscription())?.billingInterval).toBe(
        'year'
      )

      // No mesmo plano e intervalo não há o que autorizar de novo; passar
      // para o mensal é uma autorização nova.
      const same = await refusal(
        ctx.owner.pub.startPixCheckout({ plan: 'elite', annual: true })
      )
      expect(same.message).toBe('Você já paga este plano pelo Pix.')
      await ctx.owner.pub.startPixCheckout({ plan: 'elite', annual: false })
      expect(abacate.products.at(-1)).toBe('elite_founder_monthly')
      expect(abacate.checkouts.at(-1)?.externalId.endsWith(':y')).toBe(false)
    } finally {
      seats.mockRestore()
      await ctx.cleanup()
    }
  }
)
