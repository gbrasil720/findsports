import { afterAll, afterEach, expect, spyOn, test } from 'bun:test'
import { isDisposableTestDatabase } from '@findsports_oficial/db/utils/db-resolver'
import type Stripe from 'stripe'

const integrationTest = isDisposableTestDatabase() ? test : test.skip

const password = 'Senha-de-teste-336!'

async function setup() {
  const [
    { db, eq, inArray, sql },
    { account, rateLimit, stripeSubscription, user },
    { bar, subscription },
    { auth },
    { stripeClient },
    { syncStripeEvent }
  ] = await Promise.all([
    import('@findsports_oficial/db'),
    import('@findsports_oficial/db/schema/auth'),
    import('@findsports_oficial/db/schema/platform'),
    import('./index'),
    import('./stripe-client'),
    import('./stripe-sync')
  ])
  const baseUrl = process.env.BETTER_AUTH_URL ?? 'http://localhost:3001'
  const passwordHash = await (await auth.$context).password.hash(password)
  const userIds: string[] = []

  // IP próprio por login: o rate limit do sign-in (3 por 10s, no banco) é
  // por IP, e o arquivo entra mais vezes do que isso.
  const octet = () => Math.floor(Math.random() * 256)
  const clientIps: string[] = []

  /** Dono de bar com senha; `stripeStatus` cria a assinatura do provedor. */
  async function createOwner(
    stripeStatus?: 'active' | 'inactive' | 'cancelled'
  ): Promise<{ id: string; email: string; subscriptionId: string | null }> {
    const id = crypto.randomUUID()
    const email = `${id}@integration.invalid`
    const subscriptionId = stripeStatus ? `sub_${id}` : null
    await db.insert(user).values({
      id,
      name: 'Dono WEB-336',
      email,
      emailVerified: true,
      role: 'pub',
      onboardingCompleted: true,
      stripeCustomerId: `cus_${id}`
    })
    userIds.push(id)
    await db.insert(account).values({
      id: crypto.randomUUID(),
      accountId: id,
      providerId: 'credential',
      userId: id,
      password: passwordHash
    })
    const barId = crypto.randomUUID()
    await db.insert(bar).values({
      id: barId,
      userId: id,
      name: 'Bar da exclusão',
      address: 'Rua descartável, 1',
      neighborhood: 'Teste',
      city: 'Teste',
      latitude: '-35.75000000',
      longitude: '-37.25000000'
    })
    await db.insert(subscription).values({
      barId,
      plan: 'starter',
      status: stripeStatus ?? 'trialing',
      ...(subscriptionId
        ? {
            provider: 'stripe' as const,
            externalSubscriptionId: subscriptionId
          }
        : {})
    })
    if (subscriptionId) {
      // A linha do plugin, como o checkout a deixa: sem FK para o dono.
      await db.insert(stripeSubscription).values({
        id: subscriptionId,
        plan: 'starter',
        referenceId: id,
        stripeCustomerId: `cus_${id}`,
        stripeSubscriptionId: subscriptionId,
        status: 'active'
      })
    }
    return { id, email, subscriptionId }
  }

  const pluginRowExists = async (userId: string) =>
    (
      await db
        .select({ id: stripeSubscription.id })
        .from(stripeSubscription)
        .where(eq(stripeSubscription.referenceId, userId))
    ).length === 1

  const userExists = async (id: string) =>
    (await db.select({ id: user.id }).from(user).where(eq(user.id, id)))
      .length === 1

  async function subscriptionStatusOf(userId: string) {
    const row = await db.query.bar.findFirst({
      where: eq(bar.userId, userId),
      with: { subscription: true }
    })
    return row?.subscription?.status ?? null
  }

  function post(path: string, cookie: string, body: unknown, clientIp: string) {
    return auth.handler(
      new Request(`${baseUrl}/api/auth${path}`, {
        method: 'POST',
        headers: {
          cookie,
          origin: baseUrl,
          'content-type': 'application/json',
          'x-forwarded-for': clientIp
        },
        body: JSON.stringify(body)
      })
    )
  }

  /** Entra e pede a exclusão com a senha, como a tela faz. */
  async function deleteAccount(email: string) {
    const clientIp = `10.${octet()}.${octet()}.${octet()}`
    clientIps.push(clientIp)
    const signedIn = await post(
      '/sign-in/email',
      '',
      { email, password },
      clientIp
    )
    expect(signedIn.status).toBe(200)
    const cookie = signedIn.headers
      .getSetCookie()
      .map((item) => item.split(';')[0])
      .join('; ')
    return post('/delete-user', cookie, { password }, clientIp)
  }

  /** O Stripe como dublê: a assinatura lida e o que acontece ao cancelar. */
  function stubStripe(
    status: Stripe.Subscription.Status,
    cancel: () => Promise<unknown> = async () => ({})
  ) {
    const found = (id: string) =>
      ({
        id,
        status,
        customer: id.replace('sub_', 'cus_'),
        metadata: { userId: id.replace('sub_', '') },
        items: {
          data: [
            {
              current_period_end: 1_800_000_000,
              price: { id: 'price_1', lookup_key: 'starter_monthly' }
            }
          ]
        }
      }) as unknown as Stripe.Response<Stripe.Subscription>
    return {
      retrieve: spyOn(
        stripeClient.subscriptions,
        'retrieve'
      ).mockImplementation(((id: string) =>
        Promise.resolve(
          found(id)
        )) as unknown as typeof stripeClient.subscriptions.retrieve),
      cancel: spyOn(stripeClient.subscriptions, 'cancel').mockImplementation(
        cancel as unknown as typeof stripeClient.subscriptions.cancel
      )
    }
  }

  async function cleanup() {
    // `account`, `bar` e `subscription` caem em cascata com o dono.
    if (userIds.length > 0) {
      await db.delete(user).where(inArray(user.id, userIds))
      await db
        .delete(stripeSubscription)
        .where(inArray(stripeSubscription.referenceId, userIds))
    }
    for (const clientIp of clientIps) {
      await db
        .delete(rateLimit)
        .where(sql`${rateLimit.key} like ${`${clientIp}|%`}`)
    }
  }

  return {
    syncStripeEvent,
    createOwner,
    userExists,
    pluginRowExists,
    subscriptionStatusOf,
    deleteAccount,
    stubStripe,
    cleanup
  }
}

const context = isDisposableTestDatabase() ? await setup() : null
function ready() {
  if (!context) throw new Error('banco descartável indisponível')
  return context
}
const spies: { mockRestore(): void }[] = []
afterEach(() => {
  for (const spy of spies.splice(0)) spy.mockRestore()
})
afterAll(async () => {
  await context?.cleanup()
})

integrationTest(
  'conta com assinatura ativa: encerra no Stripe e exclui (WEB-336)',
  async () => {
    const t = ready()
    const owner = await t.createOwner('active')
    const other = await t.createOwner('active')
    const stripe = t.stubStripe('active')
    spies.push(stripe.retrieve, stripe.cancel)

    const response = await t.deleteAccount(owner.email)

    expect(response.status).toBe(200)
    expect(stripe.cancel).toHaveBeenCalledTimes(1)
    expect(stripe.cancel.mock.calls[0] as unknown[]).toEqual([
      owner.subscriptionId,
      {},
      { timeout: 5000, maxNetworkRetries: 0 }
    ])
    expect(await t.userExists(owner.id)).toBe(false)
    expect(await t.userExists(other.id)).toBe(true)
    // A linha do plugin não tem FK: sai pelo `afterDelete`, e só a de quem
    // foi apagado.
    expect(await t.pluginRowExists(owner.id)).toBe(false)
    expect(await t.pluginRowExists(other.id)).toBe(true)

    // O `customer.subscription.deleted` chega depois, sem bar para achar: só
    // registra, sem lançar (lançar faria o Stripe reenviar à toa).
    stripe.retrieve.mockRestore()
    await t.syncStripeEvent(
      {
        type: 'customer.subscription.deleted',
        data: { object: { id: owner.subscriptionId } }
      } as unknown as Stripe.Event,
      {
        subscriptions: {
          retrieve: async () => ({
            id: owner.subscriptionId,
            status: 'canceled',
            customer: `cus_${owner.id}`,
            metadata: { userId: owner.id },
            items: {
              data: [
                {
                  current_period_end: 1_800_000_000,
                  price: { id: 'price_1', lookup_key: 'starter_monthly' }
                }
              ]
            }
          })
        }
      } as unknown as Stripe
    )
  }
)

integrationTest(
  'Stripe recusando o cancelamento: a conta e a assinatura ficam',
  async () => {
    const t = ready()
    const owner = await t.createOwner('active')
    const stripe = t.stubStripe('active', () =>
      Promise.reject(new Error('Request timed out'))
    )
    spies.push(stripe.retrieve, stripe.cancel)

    const response = await t.deleteAccount(owner.email)

    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({
      code: 'SUBSCRIPTION_CANCEL_FAILED'
    })
    expect(stripe.cancel).toHaveBeenCalledTimes(1)
    expect(await t.userExists(owner.id)).toBe(true)
    expect(await t.subscriptionStatusOf(owner.id)).toBe('active')
    expect(await t.pluginRowExists(owner.id)).toBe(true)
  }
)

integrationTest(
  'assinatura que o Stripe não conhece: exclui em vez de travar o dono',
  async () => {
    const t = ready()
    const owner = await t.createOwner('active')
    const stripe = t.stubStripe('active')
    stripe.retrieve.mockImplementation((() =>
      Promise.reject(
        Object.assign(new Error('No such subscription'), {
          code: 'resource_missing'
        })
      )) as unknown as Parameters<typeof stripe.retrieve.mockImplementation>[0])
    spies.push(stripe.retrieve, stripe.cancel)

    const response = await t.deleteAccount(owner.email)

    expect(response.status).toBe(200)
    expect(stripe.cancel).not.toHaveBeenCalled()
    expect(await t.userExists(owner.id)).toBe(false)
    expect(await t.pluginRowExists(owner.id)).toBe(false)
  }
)

integrationTest(
  'assinatura que o Stripe já encerrou: exclui sem cancelar de novo',
  async () => {
    const t = ready()
    const owner = await t.createOwner('active')
    const stripe = t.stubStripe('canceled')
    spies.push(stripe.retrieve, stripe.cancel)

    const response = await t.deleteAccount(owner.email)

    expect(response.status).toBe(200)
    expect(stripe.cancel).not.toHaveBeenCalled()
    expect(await t.userExists(owner.id)).toBe(false)
  }
)

integrationTest(
  'assinatura pausada no Stripe: é encerrada lá antes de a conta sair',
  async () => {
    const t = ready()
    // `inactive` é a `paused` do Stripe: não cobra, mas continua existindo.
    const owner = await t.createOwner('inactive')
    const stripe = t.stubStripe('paused')
    spies.push(stripe.retrieve, stripe.cancel)

    const response = await t.deleteAccount(owner.email)

    expect(response.status).toBe(200)
    expect(stripe.cancel.mock.calls as unknown[]).toEqual([
      [owner.subscriptionId, {}, { timeout: 5000, maxNetworkRetries: 0 }]
    ])
    expect(await t.userExists(owner.id)).toBe(false)
    expect(await t.pluginRowExists(owner.id)).toBe(false)
  }
)

integrationTest(
  'conta sem assinatura viva no Stripe exclui sem chamar o Stripe',
  async () => {
    const t = ready()
    // Teste do cadastro (sem provedor) e assinatura já encerrada.
    const owners = [await t.createOwner(), await t.createOwner('cancelled')]
    const stripe = t.stubStripe('active')
    spies.push(stripe.retrieve, stripe.cancel)

    for (const owner of owners) {
      const response = await t.deleteAccount(owner.email)
      expect(response.status).toBe(200)
      expect(await t.userExists(owner.id)).toBe(false)
    }
    expect(stripe.retrieve).not.toHaveBeenCalled()
    expect(stripe.cancel).not.toHaveBeenCalled()
  }
)
