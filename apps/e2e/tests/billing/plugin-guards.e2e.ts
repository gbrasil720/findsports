import { randomUUID } from 'node:crypto'
import type { Page } from '@playwright/test'
import { BASE_URL, STUB_URL } from '../../env'
import { signIn } from '../../fixtures/auth'
import { query } from '../../fixtures/db'
import { createPub, inDays } from '../../fixtures/pubs'
import { expect, test } from '../../fixtures/test'

// O hook do better-auth na frente das rotas do plugin do Stripe
// (`packages/auth/src/index.ts`), chamado como a rota chamada direto: o que
// se prova é o servidor, não a tela.

const upgrade = (page: Page, data: Record<string, unknown>) =>
  page.request.post('/api/auth/subscription/upgrade', {
    data: {
      successUrl: '/plan/confirmed',
      cancelUrl: '/plan',
      disableRedirect: true,
      ...data
    },
    headers: { origin: BASE_URL }
  })

/** Sessões de checkout e de portal que o app pediu ao Stripe para o cliente. */
async function stripeSessionsOf(page: Page, userId: string) {
  const calls = (await (
    await page.request.get(`${STUB_URL}/stripe/calls`)
  ).json()) as { path: string; body: Record<string, string> }[]
  return calls.filter(
    (call) =>
      (call.path === '/checkout/sessions' ||
        call.path === '/billing_portal/sessions') &&
      (call.body['metadata[userId]'] === userId ||
        call.body.customer?.includes(userId))
  )
}

test('upgrade com metadata no corpo: 400, e nada pedido ao Stripe', async ({
  page
}) => {
  const { user } = await createPub({
    subscription: {
      plan: 'pro',
      status: 'trialing',
      currentPeriodEnd: inDays(20)
    }
  })
  await signIn(page, user)
  const response = await upgrade(page, {
    plan: 'elite',
    metadata: { founderCoupon: 'fundador_anual' }
  })
  expect(response.status(), await response.text()).toBe(400)
  expect(await stripeSessionsOf(page, user.id)).toEqual([])
})

test('assinatura anual no cartão trocando de plano no mensal: 409 BILLING_INTERVAL_MISMATCH', async ({
  page
}) => {
  const subscriptionId = `sub_e2e_${randomUUID()}`
  const { user } = await createPub({
    subscription: {
      plan: 'pro',
      status: 'active',
      externalSubscriptionId: subscriptionId
    }
  })
  await query(
    `UPDATE stripe_subscription SET billing_interval = 'year'
      WHERE stripe_subscription_id = $1`,
    [subscriptionId]
  )
  await signIn(page, user)
  for (const body of [{ plan: 'elite' }, { plan: 'elite', annual: false }]) {
    const response = await upgrade(page, body)
    expect(response.status(), await response.text()).toBe(409)
    expect(await response.json()).toMatchObject({
      code: 'BILLING_INTERVAL_MISMATCH'
    })
  }
  expect(await stripeSessionsOf(page, user.id)).toEqual([])
})

test('assinatura mensal no cartão pedindo o anual: 409 também', async ({
  page
}) => {
  const { user } = await createPub({
    subscription: {
      plan: 'pro',
      status: 'active',
      externalSubscriptionId: `sub_e2e_${randomUUID()}`
    }
  })
  await query(
    `UPDATE stripe_subscription SET billing_interval = 'month'
      WHERE reference_id = $1`,
    [user.id]
  )
  await signIn(page, user)
  const response = await upgrade(page, { plan: 'elite', annual: true })
  expect(response.status(), await response.text()).toBe(409)
  expect(await response.json()).toMatchObject({
    code: 'BILLING_INTERVAL_MISMATCH'
  })
  expect(await stripeSessionsOf(page, user.id)).toEqual([])
})

test('/subscription/cancel e /subscription/restore do plugin: 404', async ({
  page
}) => {
  const subscriptionId = `sub_e2e_${randomUUID()}`
  const { user } = await createPub({
    subscription: {
      plan: 'pro',
      status: 'active',
      externalSubscriptionId: subscriptionId
    }
  })
  await signIn(page, user)
  for (const path of ['cancel', 'restore']) {
    const response = await page.request.post(`/api/auth/subscription/${path}`, {
      data: { subscriptionId, returnUrl: '/admin/billing' },
      headers: { origin: BASE_URL }
    })
    expect(response.status(), `${path}: ${await response.text()}`).toBe(404)
  }
  // A linha do plugin continua lá: a troca seguinte não abre outra assinatura.
  const [row] = await query<{ status: string }>(
    'SELECT status FROM stripe_subscription WHERE stripe_subscription_id = $1',
    [subscriptionId]
  )
  expect(row?.status).toBe('active')
})
