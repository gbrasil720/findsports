import { randomInt } from 'node:crypto'
import type { APIRequestContext, PlaywrightWorkerArgs } from '@playwright/test'
import { BASE_URL } from '../../env'
import { signIn, storageState } from '../../fixtures/auth'
import { query } from '../../fixtures/db'
import { createPub, inDays, type PubOptions } from '../../fixtures/pubs'
import {
  deliverSubscription,
  sendStripeWebhook,
  stripeSubscription
} from '../../fixtures/stripe'
import { expect, test } from '../../fixtures/test'

// Transições de assinatura pelo webhook assinado do Stripe (WEB-31). Webhook
// não passa pelo portão de `billing.checkout_enabled`, então nada aqui é
// serial. O `request` dos testes vai sem cookie, como o Stripe: com sessão, o
// better-auth exigiria `Origin`.

/**
 * Um ponto no interior do Amazonas, longe de São Paulo e dos outros testes:
 * com raio de 1 km, a busca por localização só acha o bar deste teste.
 */
function remoteSpot() {
  return {
    latitude: -4 - randomInt(400_000) / 100_000,
    longitude: -62 - randomInt(400_000) / 100_000
  }
}

async function createRemotePub(options: PubOptions = {}) {
  const spot = remoteSpot()
  const pub = await createPub({ ...options, bar: { ...spot, ...options.bar } })
  return { ...pub, spot }
}

/** Ids dos bares que a busca por localização do torcedor devolve. */
async function fanSearch(
  playwright: PlaywrightWorkerArgs['playwright'],
  spot: { latitude: number; longitude: number }
): Promise<string[]> {
  // Sessão compartilhada do torcedor, só para ler.
  const fan = await playwright.request.newContext({
    baseURL: BASE_URL,
    storageState: storageState('fan')
  })
  const input = { lat: spot.latitude, lng: spot.longitude, radiusKm: 1 }
  const response = await fan.get(
    `/api/trpc/pubs.searchByLocation?input=${encodeURIComponent(JSON.stringify(input))}`
  )
  const text = await response.text()
  await fan.dispose()
  expect(response.ok(), text).toBe(true)
  const body = JSON.parse(text) as {
    result: { data: { bars: { id: string }[] } }
  }
  return body.result.data.bars.map((bar) => bar.id)
}

async function stateOf(barId: string) {
  const [row] = await query<{
    status: string
    plan: string
    provider: string | null
    external_subscription_id: string | null
    current_period_end: string | null
    is_active: boolean
  }>(
    `SELECT s.status, s.plan, s.provider, s.external_subscription_id, b.is_active,
            -- Coluna sem fuso, gravada em UTC pelo app: lida como texto, e
            -- não como Date, que o pg interpretaria no fuso local.
            to_char(s.current_period_end, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS current_period_end
       FROM bar b LEFT JOIN subscription s ON s.bar_id = b.id
      WHERE b.id = $1`,
    [barId]
  )
  return row
}

async function deliver(
  request: APIRequestContext,
  type: Parameters<typeof deliverSubscription>[1],
  subscription: Parameters<typeof stripeSubscription>[0]
) {
  const response = await deliverSubscription(
    request,
    type,
    stripeSubscription(subscription)
  )
  expect(response.ok(), await response.text()).toBe(true)
}

test('ativa: cria a assinatura, ativa o bar e o bar aparece na busca', async ({
  playwright,
  request
}) => {
  const { user, barId, spot } = await createRemotePub({
    subscription: null,
    bar: { is_active: false }
  })
  expect(await fanSearch(playwright, spot)).not.toContain(barId)

  const currentPeriodEnd = inDays(40)
  // O Stripe conta o período em segundos inteiros.
  currentPeriodEnd.setMilliseconds(0)
  await deliver(request, 'customer.subscription.created', {
    id: `sub_e2e_${barId}`,
    status: 'active',
    plan: 'elite',
    userId: user.id,
    currentPeriodEnd
  })

  expect(await stateOf(barId)).toEqual({
    status: 'active',
    plan: 'elite',
    provider: 'stripe',
    external_subscription_id: `sub_e2e_${barId}`,
    current_period_end: currentPeriodEnd.toISOString(),
    is_active: true
  })
  expect(await fanSearch(playwright, spot)).toContain(barId)
})

test('renovada: assinatura parada volta a ativa, com o novo período', async ({
  request
}) => {
  const subscriptionId = `sub_e2e_${randomInt(1e9)}`
  const { user, barId } = await createPub({
    subscription: {
      plan: 'pro',
      status: 'past_due',
      externalSubscriptionId: subscriptionId
    }
  })

  const currentPeriodEnd = inDays(60)
  currentPeriodEnd.setMilliseconds(0)
  await deliver(request, 'customer.subscription.updated', {
    id: subscriptionId,
    status: 'active',
    plan: 'pro',
    userId: user.id,
    currentPeriodEnd
  })

  expect(await stateOf(barId)).toMatchObject({
    status: 'active',
    plan: 'pro',
    current_period_end: currentPeriodEnd.toISOString(),
    is_active: true
  })
})

for (const status of ['past_due', 'unpaid'] as const) {
  test(`${status}: vira past_due e o painel avisa o pagamento pendente`, async ({
    page,
    request
  }) => {
    const subscriptionId = `sub_e2e_${randomInt(1e9)}`
    const { user, barId } = await createPub({
      subscription: {
        plan: 'pro',
        status: 'active',
        externalSubscriptionId: subscriptionId
      }
    })

    await deliver(request, 'customer.subscription.updated', {
      id: subscriptionId,
      status,
      plan: 'pro',
      userId: user.id
    })

    // Bar segue no ar: a janela de regularização vai até o cancelamento.
    expect(await stateOf(barId)).toMatchObject({
      status: 'past_due',
      plan: 'pro',
      is_active: true
    })

    await signIn(page, user)
    await page.goto('/admin#admin-espaco')
    await expect(
      page.getByText('Plano Pro com pagamento pendente')
    ).toBeVisible()
    await expect(
      page.getByRole('link', { name: 'Regularizar assinatura' })
    ).toBeVisible()
  })
}

test('encerrada: desativa a assinatura e o bar some da busca', async ({
  playwright,
  request
}) => {
  const subscriptionId = `sub_e2e_${randomInt(1e9)}`
  const { user, barId, spot } = await createRemotePub({
    subscription: {
      plan: 'elite',
      status: 'active',
      externalSubscriptionId: subscriptionId
    }
  })
  expect(await fanSearch(playwright, spot)).toContain(barId)

  await deliver(request, 'customer.subscription.deleted', {
    id: subscriptionId,
    status: 'canceled',
    plan: 'elite',
    userId: user.id
  })

  expect(await stateOf(barId)).toMatchObject({
    status: 'inactive',
    is_active: false
  })
  expect(await fanSearch(playwright, spot)).not.toContain(barId)
})

test('troca de plano no portal do Stripe muda o plano do bar', async ({
  request
}) => {
  const subscriptionId = `sub_e2e_${randomInt(1e9)}`
  const { user, barId } = await createPub({
    subscription: {
      plan: 'pro',
      status: 'active',
      externalSubscriptionId: subscriptionId
    }
  })

  await deliver(request, 'customer.subscription.updated', {
    id: subscriptionId,
    status: 'active',
    plan: 'elite',
    userId: user.id
  })

  expect(await stateOf(barId)).toMatchObject({
    status: 'active',
    plan: 'elite',
    is_active: true
  })
})

test('contratou no teste grátis: segue em teste, agora com assinatura no Stripe', async ({
  request
}) => {
  const trialEnd = inDays(100)
  trialEnd.setMilliseconds(0)
  const { user, barId } = await createPub({
    subscription: {
      plan: 'elite',
      status: 'trialing',
      currentPeriodEnd: trialEnd
    }
  })

  await deliver(request, 'customer.subscription.created', {
    id: `sub_e2e_${barId}`,
    status: 'trialing',
    plan: 'pro',
    userId: user.id,
    currentPeriodEnd: trialEnd
  })

  expect(await stateOf(barId)).toEqual({
    status: 'trialing',
    plan: 'pro',
    provider: 'stripe',
    external_subscription_id: `sub_e2e_${barId}`,
    current_period_end: trialEnd.toISOString(),
    is_active: true
  })
})

test('o corpo do evento não manda: vale o estado atual no Stripe', async ({
  request
}) => {
  const subscriptionId = `sub_e2e_${randomInt(1e9)}`
  const { user, barId } = await createPub({
    subscription: {
      plan: 'pro',
      status: 'active',
      externalSubscriptionId: subscriptionId
    }
  })
  const current = { id: subscriptionId, plan: 'pro', userId: user.id } as const
  await deliver(request, 'customer.subscription.updated', {
    ...current,
    status: 'active'
  })

  // Evento antigo chegando atrasado, ou repetido: diz "encerrada", mas no
  // Stripe a assinatura está ativa. Nada muda.
  const stale = await sendStripeWebhook(request, {
    id: `evt_e2e_atrasado_${subscriptionId}`,
    object: 'event',
    type: 'customer.subscription.deleted',
    data: { object: stripeSubscription({ ...current, status: 'canceled' }) }
  })
  expect(stale.ok(), await stale.text()).toBe(true)

  expect(await stateOf(barId)).toMatchObject({
    status: 'active',
    plan: 'pro',
    is_active: true
  })
})

// WEB-194: casos que o webhook não aplica respondem 200 (reenvio não conserta)
// e não mexem em plano, assinatura nem bar.

test('preço desconhecido: não cria assinatura nem ativa o bar', async ({
  request
}) => {
  const { user, barId } = await createPub({
    subscription: null,
    bar: { is_active: false }
  })

  await deliver(request, 'customer.subscription.created', {
    id: `sub_e2e_${barId}`,
    status: 'active',
    plan: 'starter',
    lookupKey: 'plano_inexistente',
    userId: user.id
  })

  expect(await stateOf(barId)).toEqual({
    status: null,
    plan: null,
    provider: null,
    external_subscription_id: null,
    current_period_end: null,
    is_active: false
  })
})

test('preço desconhecido na renovação: o plano pago não vira Starter', async ({
  request
}) => {
  const subscriptionId = `sub_e2e_${randomInt(1e9)}`
  const { user, barId } = await createPub({
    subscription: {
      plan: 'elite',
      status: 'past_due',
      externalSubscriptionId: subscriptionId
    }
  })
  const before = await stateOf(barId)
  expect(before).toMatchObject({ plan: 'elite', status: 'past_due' })

  await deliver(request, 'customer.subscription.updated', {
    id: subscriptionId,
    status: 'active',
    plan: 'elite',
    lookupKey: 'plano_inexistente',
    userId: user.id,
    currentPeriodEnd: inDays(60)
  })

  expect(await stateOf(barId)).toEqual(before)
})

test('pagamento que não concluiu não derruba o teste grátis do cadastro', async ({
  request
}) => {
  const { user, barId } = await createPub({
    subscription: { plan: 'elite', status: 'trialing' }
  })
  const before = await stateOf(barId)

  await deliver(request, 'customer.subscription.created', {
    id: `sub_e2e_${barId}`,
    status: 'incomplete',
    plan: 'starter',
    userId: user.id
  })

  expect(await stateOf(barId)).toEqual(before)
})
