import { afterAll, afterEach, expect, spyOn, test } from 'bun:test'
import { isDisposableTestDatabase } from '@findsports_oficial/db/utils/db-resolver'
import type Stripe from 'stripe'
import { pixUpgradeCents } from './stripe-plan'

const integrationTest = isDisposableTestDatabase() ? test : test.skip

// Do Pix para o cartão (WEB-536): o checkout cobra no fim do mês pago, o
// cartão confirmado cancela o Pix na AbacatePay, e nenhuma ordem de avisos
// tira o bar do ar. A AbacatePay é um dublê do `fetch`; o Stripe, objetos.

const ABACATE = 'https://api.abacatepay.com/v2'
const DAY = 24 * 3_600_000

/** Dublê da AbacatePay: só as assinaturas e o cancelamento. */
const abacate = {
  subs: new Map<string, { status: string; currentPeriodEnd: string }>(),
  cancels: [] as string[],
  down: false,
  reset() {
    this.subs.clear()
    this.cancels = []
    this.down = false
  }
}
const realFetch = globalThis.fetch
const reply = (status: number, data: unknown, error: string | null = null) =>
  new Response(JSON.stringify({ data, error }), {
    status,
    headers: { 'content-type': 'application/json' }
  })
globalThis.fetch = (async (
  input: string | URL | Request,
  init?: RequestInit
) => {
  const url = String(input instanceof Request ? input.url : input)
  if (!url.startsWith(ABACATE)) return realFetch(input, init)
  const path = url.slice(ABACATE.length)
  if (path.startsWith('/subscriptions/get')) {
    const id = new URL(url).searchParams.get('id') ?? ''
    const sub = abacate.subs.get(id)
    if (!sub) return reply(404, null, 'Subscription not found')
    return reply(200, {
      id,
      status: sub.status,
      currentPeriodEnd: sub.currentPeriodEnd,
      createdAt: '2026-10-01T00:00:00Z'
    })
  }
  if (path === '/subscriptions/cancel') {
    const { id } = JSON.parse(String(init?.body)) as { id: string }
    abacate.cancels.push(id)
    if (abacate.down) return reply(502, null, 'Bad gateway')
    const sub = abacate.subs.get(id)
    if (!sub) return reply(404, null, 'Subscription not found')
    if (sub.status !== 'ACTIVE') {
      return reply(400, null, 'Subscription is not active')
    }
    sub.status = 'CANCELLED'
    return reply(200, { id, status: 'CANCELLED' })
  }
  return reply(404, null, `rota não dublada: ${path}`)
}) as typeof fetch

async function setup() {
  const [{ db, eq, inArray }, { user }, { bar, subscription }, sync, pix, co] =
    await Promise.all([
      import('@findsports_oficial/db'),
      import('@findsports_oficial/db/schema/auth'),
      import('@findsports_oficial/db/schema/platform'),
      import('./stripe-sync'),
      import('./pix-sync'),
      import('./stripe-checkout')
    ])
  const userIds: string[] = []

  /** Bar no ar pagando Pix: ativo, ciclo pago até `paidUntil`. */
  async function createPixBar(opts: { founder?: boolean; paidUntil: Date }) {
    const userId = crypto.randomUUID()
    const barId = crypto.randomUUID()
    const customerId = `cus_${userId}`
    const pixId = `subs_${barId.slice(0, 8)}`
    await db.insert(user).values({
      id: userId,
      name: 'Dono WEB-536',
      email: `${userId}@integration.invalid`,
      emailVerified: true,
      role: 'pub',
      stripeCustomerId: customerId
    })
    userIds.push(userId)
    await db.insert(bar).values({
      id: barId,
      userId,
      name: 'Bar do Pix',
      address: 'Rua descartável, 1',
      neighborhood: 'Teste',
      city: 'Teste',
      latitude: '-35.75000000',
      longitude: '-37.25000000',
      isActive: true
    })
    await db.insert(subscription).values({
      barId,
      status: 'active',
      plan: 'pro',
      provider: 'abacatepay',
      externalSubscriptionId: pixId,
      currentPeriodEnd: opts.paidUntil,
      monthlyDiscountReais: opts.founder ? 28 : 0
    })
    abacate.subs.set(pixId, {
      status: 'ACTIVE',
      currentPeriodEnd: opts.paidUntil.toISOString()
    })
    return {
      owner: { id: userId, name: 'Dono WEB-536' },
      userId,
      barId,
      customerId,
      pixId,
      externalId: `onside:${barId}:pro:${opts.founder ? 'f' : 't'}:abcd1234`
    }
  }

  async function stateOf(barId: string) {
    const row = await db.query.bar.findFirst({
      where: eq(bar.id, barId),
      with: { subscription: true }
    })
    const sub = row?.subscription
    return {
      isActive: row?.isActive,
      status: sub?.status ?? null,
      plan: sub?.plan ?? null,
      provider: sub?.provider ?? null,
      externalSubscriptionId: sub?.externalSubscriptionId ?? null,
      cancelAt: sub?.cancelAt ?? null
    }
  }

  async function cleanup() {
    if (userIds.length > 0) {
      await db.delete(user).where(inArray(user.id, userIds))
    }
  }

  return { ...sync, ...pix, ...co, createPixBar, stateOf, cleanup }
}

/** Assinatura do cartão como o checkout a cria: em teste até o fim do Pix. */
function cardSubscription(o: {
  id: string
  customerId: string
  userId: string
  trialEnd: Date
  status?: Stripe.Subscription.Status
  upgradeCents?: number
  founderCoupon?: string
  /** Primeira fatura (a da diferença): paga por padrão. */
  firstInvoice?: 'paid' | 'open'
}) {
  return {
    id: o.id,
    status: o.status ?? 'trialing',
    cancel_at: null,
    cancel_at_period_end: false,
    customer: o.customerId,
    metadata: {
      userId: o.userId,
      ...(o.upgradeCents ? { pixUpgradeCents: String(o.upgradeCents) } : {}),
      ...(o.founderCoupon ? { founderCoupon: o.founderCoupon } : {})
    },
    latest_invoice: {
      id: 'in_first',
      status: o.firstInvoice ?? 'paid',
      amount_paid: o.firstInvoice === 'open' ? 0 : (o.upgradeCents ?? 0)
    },
    default_payment_method: 'pm_card_1',
    discounts: [],
    items: {
      data: [
        {
          current_period_end: Math.floor(o.trialEnd.getTime() / 1000),
          price: { id: 'price_elite', lookup_key: 'elite_monthly' }
        }
      ]
    }
  } as unknown as Stripe.Subscription
}

const context = isDisposableTestDatabase() ? await setup() : null
function ready() {
  if (!context) throw new Error('banco descartável indisponível')
  return context
}
afterEach(() => abacate.reset())
afterAll(async () => {
  globalThis.fetch = realFetch
  await context?.cleanup()
})

integrationTest(
  'checkout: o cartão só cobra quando acaba o mês pago no Pix',
  async () => {
    const { checkoutParamsFor, createPixBar } = ready()
    const paidUntil = new Date(Date.now() + 20 * DAY)
    const { owner } = await createPixBar({ paidUntil })
    const client = {
      coupons: {
        retrieve: async (id: string) =>
          id === 'fundador_anual' ? { times_redeemed: 0 } : { valid: true }
      }
    } as unknown as Stripe

    for (const annual of [false, true]) {
      const params = await checkoutParamsFor(owner, null, client, { annual })
      expect(params.subscription_data).toEqual({
        trial_end: Math.floor(paidUntil.getTime() / 1000)
      })
    }
  }
)

integrationTest(
  'checkout: fundador do Pix leva a vaga para o cartão mesmo com as vagas cheias',
  async () => {
    const { checkoutParamsFor, createPixBar, pixFounderCount, FOUNDER_SEATS } =
      ready()
    const founder = await createPixBar({
      founder: true,
      paidUntil: new Date(Date.now() + 20 * DAY)
    })
    const other = await createPixBar({
      paidUntil: new Date(Date.now() + 20 * DAY)
    })
    // Cartão + Pix fecham as 100 vagas, contando o fundador deste teste.
    const pixFounders = await pixFounderCount()
    const client = {
      coupons: {
        retrieve: async (id: string) =>
          id === 'fundador_anual'
            ? { times_redeemed: 0 }
            : {
                valid: true,
                max_redemptions: FOUNDER_SEATS,
                times_redeemed: FOUNDER_SEATS - pixFounders
              }
      }
    } as unknown as Stripe
    const error = spyOn(console, 'error').mockImplementation(() => {})
    try {
      const kept = await checkoutParamsFor(founder.owner, null, client)
      expect(kept.discounts).toEqual([{ coupon: 'eM7dQpMF' }])
      const full = await checkoutParamsFor(other.owner, null, client)
      expect(full.discounts).toBeUndefined()
    } finally {
      error.mockRestore()
    }
  }
)

integrationTest(
  'cartão confirmado: cancela o Pix uma vez só e o bar segue no ar',
  async () => {
    const { applyStripeSubscription, createPixBar, stateOf } = ready()
    const paidUntil = new Date(Date.now() + 20 * DAY)
    const bar = await createPixBar({ paidUntil })
    const card = cardSubscription({
      id: `sub_${bar.barId}`,
      customerId: bar.customerId,
      userId: bar.userId,
      trialEnd: paidUntil
    })
    const log = spyOn(console, 'log').mockImplementation(() => {})
    try {
      // `checkout.session.completed` e `customer.subscription.created` chegam
      // os dois; repetidos também.
      await applyStripeSubscription(card)
      await applyStripeSubscription(card)
      await applyStripeSubscription(card)
    } finally {
      log.mockRestore()
    }

    expect(abacate.cancels).toEqual([bar.pixId])
    expect(abacate.subs.get(bar.pixId)?.status).toBe('CANCELLED')
    expect(await stateOf(bar.barId)).toEqual({
      isActive: true,
      status: 'trialing',
      plan: 'elite',
      provider: 'stripe',
      externalSubscriptionId: card.id,
      cancelAt: null
    })
  }
)

integrationTest(
  'AbacatePay fora do ar: o webhook falha, o bar fica no Pix e a próxima entrega conclui',
  async () => {
    const { applyStripeSubscription, createPixBar, stateOf } = ready()
    const paidUntil = new Date(Date.now() + 20 * DAY)
    const bar = await createPixBar({ paidUntil })
    const card = cardSubscription({
      id: `sub_${bar.barId}`,
      customerId: bar.customerId,
      userId: bar.userId,
      trialEnd: paidUntil
    })

    abacate.down = true
    await expect(applyStripeSubscription(card)).rejects.toThrow()
    expect(await stateOf(bar.barId)).toMatchObject({
      isActive: true,
      status: 'active',
      plan: 'pro',
      provider: 'abacatepay',
      externalSubscriptionId: bar.pixId
    })

    abacate.down = false
    const log = spyOn(console, 'log').mockImplementation(() => {})
    try {
      await applyStripeSubscription(card)
    } finally {
      log.mockRestore()
    }
    expect(abacate.subs.get(bar.pixId)?.status).toBe('CANCELLED')
    expect(await stateOf(bar.barId)).toMatchObject({
      isActive: true,
      provider: 'stripe',
      externalSubscriptionId: card.id
    })
  }
)

integrationTest(
  'fora de ordem: o cancelado do Pix depois do cartão não derruba nada',
  async () => {
    const { applyStripeSubscription, applyPixSubscription, createPixBar } =
      ready()
    const paidUntil = new Date(Date.now() + 20 * DAY)
    const bar = await createPixBar({ paidUntil })
    const card = cardSubscription({
      id: `sub_${bar.barId}`,
      customerId: bar.customerId,
      userId: bar.userId,
      trialEnd: paidUntil
    })
    const log = spyOn(console, 'log').mockImplementation(() => {})
    try {
      await applyStripeSubscription(card)
    } finally {
      log.mockRestore()
    }

    expect(
      await applyPixSubscription(
        bar.pixId,
        bar.externalId,
        'subscription.cancelled'
      )
    ).toBeNull()
    expect(await ready().stateOf(bar.barId)).toMatchObject({
      isActive: true,
      status: 'trialing',
      provider: 'stripe',
      externalSubscriptionId: card.id,
      cancelAt: null
    })
  }
)

integrationTest(
  'fora de ordem: o cancelado do Pix antes do cartão segura o bar até o fim do mês pago',
  async () => {
    const {
      applyStripeSubscription,
      applyPixSubscription,
      createPixBar,
      stateOf
    } = ready()
    const paidUntil = new Date(Date.now() + 20 * DAY)
    const bar = await createPixBar({ paidUntil })
    // O Pix já cancelado na AbacatePay (pelo app do banco, ou o aviso do
    // nosso cancelamento chegando antes de o cartão gravar).
    const pixSub = abacate.subs.get(bar.pixId)
    if (pixSub) pixSub.status = 'CANCELLED'

    await applyPixSubscription(
      bar.pixId,
      bar.externalId,
      'subscription.cancelled'
    )
    expect(await stateOf(bar.barId)).toMatchObject({
      isActive: true,
      status: 'active',
      provider: 'abacatepay'
    })

    const card = cardSubscription({
      id: `sub_${bar.barId}`,
      customerId: bar.customerId,
      userId: bar.userId,
      trialEnd: paidUntil
    })
    const log = spyOn(console, 'log').mockImplementation(() => {})
    try {
      // Cancelar de novo responde "not active": conta como feito.
      await applyStripeSubscription(card)
    } finally {
      log.mockRestore()
    }
    expect(await stateOf(bar.barId)).toEqual({
      isActive: true,
      status: 'trialing',
      plan: 'elite',
      provider: 'stripe',
      externalSubscriptionId: card.id,
      cancelAt: null
    })
  }
)

/** Stripe que guarda as chamadas de assinatura e de checkout. */
function recordingStripe() {
  const calls: { op: string; args: unknown[] }[] = []
  const client = {
    coupons: {
      retrieve: async (id: string) =>
        id === 'fundador_anual' ? { times_redeemed: 0 } : { valid: true }
    },
    customers: {
      create: async (...args: unknown[]) => {
        calls.push({ op: 'customer', args })
        return { id: `cus_new_${crypto.randomUUID().slice(0, 6)}` }
      },
      retrieve: async () => ({ deleted: false, address: { line1: 'x' } }),
      update: async () => ({}),
      listTaxIds: async () => ({ data: [] })
    },
    prices: {
      list: async (params: { lookup_keys: string[] }) => ({
        data: [{ id: `price_${params.lookup_keys[0]}` }]
      })
    },
    checkout: {
      sessions: {
        create: async (params: unknown) => {
          calls.push({ op: 'session', args: [params] })
          return { url: 'https://checkout.stripe.test/cs_1' }
        }
      }
    },
    subscriptions: {
      update: async (...args: unknown[]) => {
        calls.push({ op: 'update', args })
        const [id, params] = args as [string, { discounts: unknown[] }]
        return { ...lastSubscription, id, discounts: params.discounts }
      },
      cancel: async (...args: unknown[]) => {
        calls.push({ op: 'cancel', args })
        return { id: args[0], status: 'canceled' }
      }
    }
  } as unknown as Stripe
  let lastSubscription: object = {}
  return {
    client,
    calls,
    remember: (sub: object) => {
      lastSubscription = sub
    }
  }
}

type SessionParams = {
  line_items: {
    price?: string
    quantity: number
    price_data?: { unit_amount: number }
  }[]
  discounts?: unknown
  allow_promotion_codes?: boolean
  cancel_url: string
  subscription_data: { trial_end: number; metadata: Record<string, string> }
}

integrationTest(
  'subida: a diferença é um item avulso da sessão, cobrado no checkout, e o cupom vai para depois',
  async () => {
    const { createPixBar, startCardFromPix } = ready()
    const paidUntil = new Date(Date.now() + 15 * DAY)
    const { owner } = await createPixBar({ paidUntil })
    const stripe = recordingStripe()

    const { url } = await startCardFromPix(
      { ...owner, email: `${owner.id}@integration.invalid` },
      { plan: 'elite' },
      stripe.client,
      'https://app.test'
    )
    expect(url).toBe('https://checkout.stripe.test/cs_1')
    const session = stripe.calls.find((c) => c.op === 'session')
      ?.args[0] as SessionParams
    const expected = pixUpgradeCents({
      currentMonthlyReais: 147,
      newMonthlyReais: 269,
      paidUntil
    })
    expect(session.line_items[0]).toEqual({
      price: 'price_elite_monthly',
      quantity: 1
    })
    const charged = session.line_items[1]?.price_data?.unit_amount ?? 0
    expect(Math.abs(charged - expected)).toBeLessThanOrEqual(1)
    // Sem cupom nem código na sessão: tirariam o desconto do item avulso.
    expect(session.discounts).toBeUndefined()
    expect(session.allow_promotion_codes).toBeUndefined()
    expect(session.subscription_data).toMatchObject({
      trial_end: Math.floor(paidUntil.getTime() / 1000),
      metadata: {
        pixUpgradeCents: String(charged),
        founderCoupon: 'eM7dQpMF',
        userId: owner.id
      }
    })
    expect(session.cancel_url).toBe(
      'https://app.test/plan?troca=cartao&para=elite'
    )
    // O dono já tinha cliente no Stripe: é o mesmo, para o plugin achá-lo.
    expect(stripe.calls.filter((c) => c.op === 'customer')).toHaveLength(0)
  }
)

integrationTest(
  'mesmo plano: só a mensalidade, com o cupom na sessão e nada cobrado hoje',
  async () => {
    const { createPixBar, startCardFromPix } = ready()
    const paidUntil = new Date(Date.now() + 15 * DAY)
    const { owner } = await createPixBar({ paidUntil })
    const stripe = recordingStripe()

    await startCardFromPix(
      { ...owner, email: `${owner.id}@integration.invalid` },
      { plan: 'pro' },
      stripe.client,
      'https://app.test'
    )
    const session = stripe.calls.find((c) => c.op === 'session')
      ?.args[0] as SessionParams
    expect(session.line_items).toHaveLength(1)
    expect(session.discounts).toEqual([{ coupon: 'eM7dQpMF' }])
    expect(session.subscription_data.metadata.pixUpgradeCents).toBeUndefined()
  }
)

integrationTest(
  'sem a chave da AbacatePay, ou sem Pix ativo: recusa antes do Stripe',
  async () => {
    const { createPixBar, startCardFromPix, CardFromPixRefusal } = ready()
    const { owner } = await createPixBar({
      paidUntil: new Date(Date.now() + 15 * DAY)
    })
    const stripe = recordingStripe()
    const who = { ...owner, email: `${owner.id}@integration.invalid` }
    await expect(
      startCardFromPix(who, { plan: 'elite' }, stripe.client, 'https://a', {
        pixCancellable: false
      })
    ).rejects.toBeInstanceOf(CardFromPixRefusal)
    await expect(
      startCardFromPix(
        { id: crypto.randomUUID(), name: 'x', email: 'x@y.invalid' },
        { plan: 'elite' },
        stripe.client,
        'https://a'
      )
    ).rejects.toBeInstanceOf(CardFromPixRefusal)
    expect(stripe.calls).toHaveLength(0)
  }
)

integrationTest(
  'diferença sem pagar: o Pix fica, o plano não muda e a assinatura do cartão é cancelada',
  async () => {
    const { applyStripeSubscription, createPixBar, stateOf } = ready()
    const paidUntil = new Date(Date.now() + 15 * DAY)
    const bar = await createPixBar({ paidUntil })
    const card = cardSubscription({
      id: `sub_${bar.barId}`,
      customerId: bar.customerId,
      userId: bar.userId,
      trialEnd: paidUntil,
      upgradeCents: 7285,
      firstInvoice: 'open'
    })
    const stripe = recordingStripe()
    const error = spyOn(console, 'error').mockImplementation(() => {})
    try {
      // Repetido e fora de ordem: nunca troca nada.
      expect(await applyStripeSubscription(card, stripe.client)).toBeNull()
      expect(await applyStripeSubscription(card, stripe.client)).toBeNull()
    } finally {
      error.mockRestore()
    }

    expect(abacate.cancels).toEqual([])
    expect(abacate.subs.get(bar.pixId)?.status).toBe('ACTIVE')
    expect(stripe.calls.filter((c) => c.op === 'cancel')[0]?.args[0]).toBe(
      card.id
    )
    expect(await stateOf(bar.barId)).toEqual({
      isActive: true,
      status: 'active',
      plan: 'pro',
      provider: 'abacatepay',
      externalSubscriptionId: bar.pixId,
      cancelAt: null
    })

    // O `deleted` do cartão cancelado chega depois: não é a assinatura do bar.
    expect(
      await applyStripeSubscription(
        { ...card, status: 'canceled' } as Stripe.Subscription,
        stripe.client
      )
    ).toBeNull()
    expect(await stateOf(bar.barId)).toMatchObject({
      isActive: true,
      provider: 'abacatepay',
      plan: 'pro'
    })
  }
)

integrationTest(
  'diferença paga: cupom de fundador na assinatura, Pix cancelado e a linha vira do cartão',
  async () => {
    const { applyStripeSubscription, createPixBar, stateOf } = ready()
    const paidUntil = new Date(Date.now() + 15 * DAY)
    const bar = await createPixBar({ paidUntil })
    const card = cardSubscription({
      id: `sub_${bar.barId}`,
      customerId: bar.customerId,
      userId: bar.userId,
      trialEnd: paidUntil,
      upgradeCents: 7285,
      founderCoupon: 'eM7dQpMF'
    })
    const stripe = recordingStripe()
    stripe.remember(card)
    const log = spyOn(console, 'log').mockImplementation(() => {})
    try {
      await applyStripeSubscription(card, stripe.client)
      await applyStripeSubscription(card, stripe.client)
    } finally {
      log.mockRestore()
    }

    const updates = stripe.calls.filter((c) => c.op === 'update')
    expect(updates).toHaveLength(1)
    expect(updates[0]?.args).toEqual([
      card.id,
      {
        discounts: [{ coupon: 'eM7dQpMF' }],
        expand: ['discounts.source.coupon']
      },
      { idempotencyKey: `pix-founder-${card.id}` }
    ])
    expect(abacate.cancels).toEqual([bar.pixId])
    expect(await stateOf(bar.barId)).toMatchObject({
      isActive: true,
      plan: 'elite',
      provider: 'stripe',
      externalSubscriptionId: card.id
    })
  }
)
