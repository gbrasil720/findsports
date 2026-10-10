import { afterAll, expect, test } from 'bun:test'
import { isDisposableTestDatabase } from '@findsports_oficial/db/utils/db-resolver'
import type Stripe from 'stripe'

const integrationTest = isDisposableTestDatabase() ? test : test.skip

async function setup() {
  const [{ db, eq, inArray }, { user }, { bar, subscription }, sync] =
    await Promise.all([
      import('@findsports_oficial/db'),
      import('@findsports_oficial/db/schema/auth'),
      import('@findsports_oficial/db/schema/platform'),
      import('./stripe-sync')
    ])
  const userIds: string[] = []

  async function createBar(
    trial?: { plan: 'starter' | 'pro' | 'elite'; currentPeriodEnd: Date } | null
  ) {
    const userId = crypto.randomUUID()
    const barId = crypto.randomUUID()
    const customerId = `cus_${userId}`
    await db.insert(user).values({
      id: userId,
      name: 'Dono WEB-31',
      email: `${userId}@integration.invalid`,
      emailVerified: true,
      role: 'pub',
      stripeCustomerId: customerId
    })
    userIds.push(userId)
    await db.insert(bar).values({
      id: barId,
      userId,
      name: 'Bar do webhook',
      address: 'Rua descartável, 1',
      neighborhood: 'Teste',
      city: 'Teste',
      latitude: '-35.75000000',
      longitude: '-37.25000000',
      isActive: Boolean(trial)
    })
    if (trial) {
      await db
        .insert(subscription)
        .values({ barId, status: 'trialing', ...trial })
    }
    return { userId, barId, customerId }
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
      currentPeriodEnd: sub?.currentPeriodEnd?.toISOString() ?? null,
      cancelAt: sub?.cancelAt?.toISOString() ?? null,
      monthlyDiscountReais: sub?.monthlyDiscountReais ?? null
    }
  }

  async function cleanup() {
    // `bar` e `subscription` caem em cascata com o dono.
    if (userIds.length > 0) {
      await db.delete(user).where(inArray(user.id, userIds))
    }
  }

  return { ...sync, createBar, stateOf, cleanup }
}

const periodEnd = new Date('2027-02-05T12:00:00.000Z')

/** Assinatura como `stripe.subscriptions.retrieve` devolve, só o que lemos. */
function stripeSubscription(options: {
  id: string
  status: Stripe.Subscription.Status
  lookupKey?: string | null
  customerId: string
  userId?: string
  founderDiscount?: boolean
  cancelAt?: Date
  cancelAtPeriodEnd?: boolean
}) {
  return {
    id: options.id,
    status: options.status,
    cancel_at: options.cancelAt
      ? Math.floor(options.cancelAt.getTime() / 1000)
      : null,
    cancel_at_period_end: options.cancelAtPeriodEnd ?? false,
    customer: options.customerId,
    metadata: options.userId ? { userId: options.userId } : {},
    discounts: options.founderDiscount
      ? [{ coupon: { amount_off: 2800, currency: 'brl' } }]
      : [],
    items: {
      data: [
        {
          current_period_end: Math.floor(periodEnd.getTime() / 1000),
          price: { id: 'price_1', lookup_key: options.lookupKey ?? null }
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
afterAll(async () => {
  await context?.cleanup()
})

integrationTest(
  'checkout no teste grátis: guarda o cartão, troca o plano e mantém o bar no ar',
  async () => {
    const { applyStripeSubscription, createBar, stateOf } = ready()
    const owner = await createBar({
      plan: 'elite',
      currentPeriodEnd: periodEnd
    })
    const sub = stripeSubscription({
      id: `sub_${owner.barId}`,
      status: 'trialing',
      lookupKey: 'pro_monthly',
      customerId: owner.customerId,
      userId: owner.userId
    })

    await applyStripeSubscription(sub)
    const expected = {
      isActive: true,
      status: 'trialing',
      plan: 'pro',
      provider: 'stripe',
      externalSubscriptionId: sub.id,
      currentPeriodEnd: periodEnd.toISOString(),
      cancelAt: null,
      monthlyDiscountReais: 0
    } as const
    expect(await stateOf(owner.barId)).toEqual(expected)

    // O mesmo evento de novo grava o mesmo estado: idempotente.
    await applyStripeSubscription(sub)
    expect(await stateOf(owner.barId)).toEqual(expected)
  }
)

integrationTest(
  'bar sem assinatura: o primeiro pagamento cria a linha e publica o bar',
  async () => {
    const { applyStripeSubscription, createBar, stateOf } = ready()
    const owner = await createBar(null)
    // Sem `metadata.userId`: assinatura criada por fora do nosso checkout, o
    // dono é achado pelo cliente do Stripe.
    await applyStripeSubscription(
      stripeSubscription({
        id: `sub_${owner.barId}`,
        status: 'active',
        lookupKey: 'starter_monthly',
        customerId: owner.customerId
      })
    )
    expect(await stateOf(owner.barId)).toMatchObject({
      isActive: true,
      status: 'active',
      plan: 'starter',
      provider: 'stripe',
      monthlyDiscountReais: 0
    })
  }
)

integrationTest(
  'desconto de fundador na assinatura grava monthlyDiscountReais',
  async () => {
    const { applyStripeSubscription, createBar, stateOf } = ready()
    const owner = await createBar(null)
    await applyStripeSubscription(
      stripeSubscription({
        id: `sub_${owner.barId}`,
        status: 'active',
        lookupKey: 'elite_monthly',
        customerId: owner.customerId,
        userId: owner.userId,
        founderDiscount: true
      })
    )
    expect(await stateOf(owner.barId)).toMatchObject({
      plan: 'elite',
      monthlyDiscountReais: 28
    })
  }
)

integrationTest(
  'checkout inicial com cupom de fundador: o desconto fica gravado já no primeiro evento, sem customer.subscription.updated (WEB-355)',
  async () => {
    const { syncStripeEvent, createBar, stateOf } = ready()
    const owner = await createBar({
      plan: 'elite',
      currentPeriodEnd: periodEnd
    })
    const id = `sub_${owner.barId}`
    const base = stripeSubscription({
      id,
      status: 'trialing',
      lookupKey: 'elite_monthly',
      customerId: owner.customerId,
      userId: owner.userId
    })
    // Formato da API que o SDK fixa (2026-08-26.dahlia): o cupom vem em
    // `source.coupon`, e só quando a leitura pede a expansão. Sem ela, e no
    // corpo de todo evento, `discounts` é uma lista de ids.
    const unexpanded = { ...base, discounts: ['di_early_bird'] }
    const expanded = {
      ...base,
      discounts: [
        {
          id: 'di_early_bird',
          source: {
            type: 'coupon',
            coupon: { id: 'eM7dQpMF', amount_off: 2800, currency: 'brl' }
          }
        }
      ]
    }
    const client = {
      subscriptions: {
        retrieve: async (_id: string, params?: { expand?: string[] }) =>
          params?.expand?.includes('discounts.source.coupon')
            ? expanded
            : unexpanded
      },
      customers: { update: async () => ({}) }
    } as unknown as Stripe
    const event = (type: string, object: unknown) =>
      ({ type, data: { object } }) as unknown as Stripe.Event

    // Os dois eventos do checkout inicial, na ordem em que o Stripe os manda.
    await syncStripeEvent(
      event('customer.subscription.created', unexpanded),
      client
    )
    expect(await stateOf(owner.barId)).toMatchObject({
      status: 'trialing',
      plan: 'elite',
      externalSubscriptionId: id,
      monthlyDiscountReais: 28
    })

    await syncStripeEvent(
      event('checkout.session.completed', {
        mode: 'subscription',
        subscription: id,
        customer: owner.customerId
      }),
      client
    )
    expect(await stateOf(owner.barId)).toMatchObject({
      monthlyDiscountReais: 28
    })
  }
)

integrationTest(
  'ciclo de vida: recusa vira past_due, encerramento tira o bar do ar',
  async () => {
    const { applyStripeSubscription, createBar, stateOf } = ready()
    const owner = await createBar(null)
    const base = {
      id: `sub_${owner.barId}`,
      lookupKey: 'elite_monthly',
      customerId: owner.customerId,
      userId: owner.userId
    }

    await applyStripeSubscription(
      stripeSubscription({ ...base, status: 'active' })
    )
    for (const status of ['past_due', 'unpaid'] as const) {
      await applyStripeSubscription(stripeSubscription({ ...base, status }))
      expect(await stateOf(owner.barId)).toMatchObject({
        isActive: true,
        status: 'past_due',
        plan: 'elite'
      })
    }

    // WEB-60: cancelada e pausada saem do ar, cada uma com o seu status, e o
    // plano contratado continua gravado.
    for (const [status, local] of [
      ['paused', 'inactive'],
      ['canceled', 'cancelled']
    ] as const) {
      await applyStripeSubscription(stripeSubscription({ ...base, status }))
      expect(await stateOf(owner.barId)).toMatchObject({
        isActive: false,
        status: local,
        plan: 'elite'
      })
      // Evento repetido grava o mesmo estado.
      await applyStripeSubscription(stripeSubscription({ ...base, status }))
      expect(await stateOf(owner.barId)).toMatchObject({
        isActive: false,
        status: local
      })
    }
  }
)

integrationTest(
  'cancelamento agendado no portal grava cancelAt, e reativar zera (WEB-335)',
  async () => {
    const { applyStripeSubscription, createBar, stateOf } = ready()
    const owner = await createBar(null)
    const base = {
      id: `sub_${owner.barId}`,
      status: 'active' as const,
      lookupKey: 'starter_monthly',
      customerId: owner.customerId,
      userId: owner.userId
    }
    const cancelAt = new Date('2027-01-20T22:54:00.000Z')

    // Billing `flexible`: o portal grava a data e deixa a flag falsa.
    await applyStripeSubscription(stripeSubscription({ ...base, cancelAt }))
    // Agendado não é encerrado: o bar segue no ar, com o plano ativo.
    expect(await stateOf(owner.barId)).toMatchObject({
      isActive: true,
      status: 'active',
      cancelAt: cancelAt.toISOString()
    })

    // "Não cancelar assinatura" no portal zera os dois campos.
    await applyStripeSubscription(stripeSubscription(base))
    expect(await stateOf(owner.barId)).toMatchObject({
      status: 'active',
      cancelAt: null
    })

    // Billing clássico: só a flag, e o fim é o do período.
    await applyStripeSubscription(
      stripeSubscription({ ...base, cancelAtPeriodEnd: true })
    )
    expect(await stateOf(owner.barId)).toMatchObject({
      status: 'active',
      cancelAt: periodEnd.toISOString()
    })

    await applyStripeSubscription(stripeSubscription(base))
    expect(await stateOf(owner.barId)).toMatchObject({ cancelAt: null })
  }
)

integrationTest(
  'encerramento atrasado da assinatura antiga não derruba a nova',
  async () => {
    const { applyStripeSubscription, createBar, stateOf } = ready()
    const owner = await createBar(null)
    const base = {
      lookupKey: 'pro_monthly',
      customerId: owner.customerId,
      userId: owner.userId
    }
    await applyStripeSubscription(
      stripeSubscription({
        ...base,
        id: `sub_nova_${owner.barId}`,
        status: 'active'
      })
    )
    for (const status of ['canceled', 'paused'] as const) {
      await applyStripeSubscription(
        stripeSubscription({
          ...base,
          id: `sub_antiga_${owner.barId}`,
          status
        })
      )
      expect(await stateOf(owner.barId)).toMatchObject({
        isActive: true,
        status: 'active',
        externalSubscriptionId: `sub_nova_${owner.barId}`
      })
    }
  }
)

integrationTest(
  'quem cancelou e contrata de novo volta ao ar com a assinatura nova',
  async () => {
    const { applyStripeSubscription, createBar, stateOf } = ready()
    const owner = await createBar(null)
    const base = {
      lookupKey: 'pro_monthly',
      customerId: owner.customerId,
      userId: owner.userId
    }
    const old = { ...base, id: `sub_antiga_${owner.barId}` }
    await applyStripeSubscription(
      stripeSubscription({ ...old, status: 'active' })
    )
    await applyStripeSubscription(
      stripeSubscription({ ...old, status: 'canceled' })
    )
    expect(await stateOf(owner.barId)).toMatchObject({
      isActive: false,
      status: 'cancelled'
    })

    await applyStripeSubscription(
      stripeSubscription({
        ...base,
        id: `sub_nova_${owner.barId}`,
        status: 'active'
      })
    )
    // O cancelamento da antiga, entregue de novo, não derruba a nova.
    await applyStripeSubscription(
      stripeSubscription({ ...old, status: 'canceled' })
    )
    expect(await stateOf(owner.barId)).toMatchObject({
      isActive: true,
      status: 'active',
      externalSubscriptionId: `sub_nova_${owner.barId}`
    })
  }
)

integrationTest(
  'preço desconhecido, checkout incompleto e cliente sem bar não gravam nada',
  async () => {
    const { applyStripeSubscription, createBar, stateOf } = ready()
    const owner = await createBar({
      plan: 'elite',
      currentPeriodEnd: periodEnd
    })
    const before = await stateOf(owner.barId)
    const base = {
      id: `sub_${owner.barId}`,
      customerId: owner.customerId,
      userId: owner.userId
    }

    // Produto fora do catálogo nunca vira plano, nem o padrão (WEB-194).
    await applyStripeSubscription(
      stripeSubscription({
        ...base,
        status: 'active',
        lookupKey: 'outro_plano'
      })
    )
    // Pagamento que não concluiu não pode derrubar o teste grátis do cadastro.
    for (const status of ['incomplete', 'incomplete_expired'] as const) {
      await applyStripeSubscription(
        stripeSubscription({ ...base, status, lookupKey: 'starter_monthly' })
      )
    }
    expect(await stateOf(owner.barId)).toEqual(before)

    // Assinatura feita por fora (Payment Link), de cliente que não é de bar
    // nenhum: responde sem lançar, para o Stripe não ficar reenviando.
    await applyStripeSubscription(
      stripeSubscription({
        id: 'sub_orfa',
        status: 'active',
        lookupKey: 'starter_monthly',
        customerId: 'cus_de_ninguem'
      })
    )
    expect(await stateOf(owner.barId)).toEqual(before)
  }
)
