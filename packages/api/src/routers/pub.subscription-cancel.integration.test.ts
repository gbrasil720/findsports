import { afterEach, expect, spyOn, test } from 'bun:test'
import type { stripeClient } from '@findsports_oficial/auth/stripe-client'
import { eq } from '@findsports_oficial/db'
import { stripeSubscription } from '@findsports_oficial/db/schema/auth'
import { subscription } from '@findsports_oficial/db/schema/platform'
import { isDisposableTestDatabase } from '@findsports_oficial/db/utils/db-resolver'
import { inAMonth, seedBar } from './integration-seed'

// `stripe` é dependência do pacote `auth`, não deste: o tipo sai do cliente.
type StripeSubscriptionStatus = Awaited<
  ReturnType<typeof stripeClient.subscriptions.retrieve>
>['status']

const integrationTest = isDisposableTestDatabase() ? test : test.skip

const spies: { mockRestore(): void }[] = []
afterEach(() => {
  for (const spy of spies.splice(0)) spy.mockRestore()
})

/** O Stripe como dublê: a situação da assinatura lida e a sessão do portal. */
async function stubStripe(
  status: StripeSubscriptionStatus,
  createSession: () => Promise<unknown> = async () => ({
    url: 'https://billing.stripe.test/sessao'
  })
) {
  const { stripeClient } = await import(
    '@findsports_oficial/auth/stripe-client'
  )
  const retrieve = spyOn(
    stripeClient.subscriptions,
    'retrieve'
  ).mockImplementation(((id: string) =>
    Promise.resolve({
      id,
      status,
      customer: 'cus_cancelamento'
    })) as unknown as typeof stripeClient.subscriptions.retrieve)
  const create = spyOn(
    stripeClient.billingPortal.sessions,
    'create'
  ).mockImplementation(
    createSession as unknown as typeof stripeClient.billingPortal.sessions.create
  )
  spies.push(retrieve, create)
  return { retrieve, create }
}

/** Bar com assinatura paga em vigor e a linha do plugin, como o checkout deixa. */
async function seedSubscribed(
  fields: Partial<typeof subscription.$inferInsert>
) {
  const seeded = await seedBar('pro', 'active', inAMonth())
  const subscriptionId = `sub_${seeded.barId}`
  await seeded.db
    .update(subscription)
    .set({
      provider: 'stripe',
      externalSubscriptionId: subscriptionId,
      ...fields
    })
    .where(eq(subscription.barId, seeded.barId))
  await seeded.db.insert(stripeSubscription).values({
    id: subscriptionId,
    plan: 'pro',
    referenceId: seeded.barId,
    stripeCustomerId: 'cus_cancelamento',
    stripeSubscriptionId: subscriptionId,
    status: 'active'
  })
  const rows = async () => ({
    plugin: await seeded.db
      .select()
      .from(stripeSubscription)
      .where(eq(stripeSubscription.id, subscriptionId)),
    app: await seeded.db
      .select()
      .from(subscription)
      .where(eq(subscription.barId, seeded.barId))
  })
  return {
    ...seeded,
    subscriptionId,
    rows,
    cleanup: async () => {
      // Sem FK para `user`: não cai na cascata do dono.
      await seeded.db
        .delete(stripeSubscription)
        .where(eq(stripeSubscription.id, subscriptionId))
      await seeded.cleanup()
    }
  }
}

integrationTest(
  'assinatura em vigor: devolve a URL do portal no cancelamento, em português, sem gravar nada',
  async () => {
    const t = await seedSubscribed({})
    try {
      const before = await t.rows()
      const stripe = await stubStripe('active')

      expect(await t.owner.pub.openSubscriptionCancel()).toEqual({
        url: 'https://billing.stripe.test/sessao'
      })

      expect(stripe.create.mock.calls as unknown[]).toEqual([
        [
          {
            customer: 'cus_cancelamento',
            locale: 'pt-BR',
            return_url: new URL('/admin/billing', process.env.BETTER_AUTH_URL)
              .href,
            flow_data: {
              type: 'subscription_cancel',
              subscription_cancel: { subscription: t.subscriptionId }
            }
          },
          { timeout: 5000, maxNetworkRetries: 0 }
        ]
      ])
      expect(await t.rows()).toEqual(before)
    } finally {
      await t.cleanup()
    }
  }
)

integrationTest(
  'Stripe dizendo past_due com o banco ainda em dia: erro, e nenhuma linha é apagada',
  async () => {
    const t = await seedSubscribed({})
    try {
      const before = await t.rows()
      const stripe = await stubStripe('past_due')

      await expect(t.owner.pub.openSubscriptionCancel()).rejects.toMatchObject({
        code: 'SERVICE_UNAVAILABLE'
      })

      expect(stripe.create).not.toHaveBeenCalled()
      const after = await t.rows()
      expect(after.plugin).toHaveLength(1)
      expect(after).toEqual(before)
    } finally {
      await t.cleanup()
    }
  }
)

integrationTest(
  'Stripe sem responder ao abrir o portal: erro, e nada muda no banco',
  async () => {
    const t = await seedSubscribed({})
    try {
      const before = await t.rows()
      await stubStripe('active', () =>
        Promise.reject(new Error('Request timed out'))
      )

      await expect(t.owner.pub.openSubscriptionCancel()).rejects.toMatchObject({
        code: 'SERVICE_UNAVAILABLE'
      })
      expect(await t.rows()).toEqual(before)
    } finally {
      await t.cleanup()
    }
  }
)

integrationTest(
  'teste do cadastro sem Stripe e cancelamento já agendado são recusados sem chamar o Stripe',
  async () => {
    const semStripe = await seedBar('elite', 'trialing', inAMonth())
    const agendado = await seedSubscribed({ cancelAt: inAMonth() })
    try {
      const stripe = await stubStripe('active')

      for (const owner of [semStripe.owner, agendado.owner]) {
        await expect(owner.pub.openSubscriptionCancel()).rejects.toMatchObject({
          code: 'PRECONDITION_FAILED'
        })
      }
      expect(stripe.retrieve).not.toHaveBeenCalled()
      expect(stripe.create).not.toHaveBeenCalled()
    } finally {
      await semStripe.cleanup()
      await agendado.cleanup()
    }
  }
)

// O torcedor não tem bar: a procedure é só do dono.
integrationTest('torcedor não abre o cancelamento', async () => {
  const t = await seedSubscribed({})
  try {
    const stripe = await stubStripe('active')
    await expect(t.fan.pub.openSubscriptionCancel()).rejects.toMatchObject({
      code: 'FORBIDDEN'
    })
    expect(stripe.retrieve).not.toHaveBeenCalled()
  } finally {
    await t.cleanup()
  }
})
