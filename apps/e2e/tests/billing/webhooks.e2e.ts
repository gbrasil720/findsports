import { randomInt } from 'node:crypto'
import type { APIRequestContext, PlaywrightWorkerArgs } from '@playwright/test'
import { BASE_URL } from '../../env'
import { signIn, storageState } from '../../fixtures/auth'
import { query } from '../../fixtures/db'
import { sendDodoWebhook } from '../../fixtures/dodo'
import {
  type SubscriptionEvent,
  subscriptionWebhook
} from '../../fixtures/dodo-payloads'
import { createPub, inDays, type PubOptions } from '../../fixtures/pubs'
import { expect, test } from '../../fixtures/test'

// Transições de assinatura pelo webhook assinado da Dodo. Webhook não passa
// pelo portão de `billing.checkout_enabled`, então nada aqui é serial. O
// `request` dos testes vai sem cookie, como a Dodo: com sessão, o better-auth
// exigiria `Origin`.

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
    dodo_subscription_id: string | null
    current_period_end: string | null
    is_active: boolean
  }>(
    `SELECT s.status, s.plan, s.dodo_subscription_id, b.is_active,
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
  type: SubscriptionEvent,
  options: Parameters<typeof subscriptionWebhook>[1]
) {
  const response = await sendDodoWebhook(
    request,
    subscriptionWebhook(type, options)
  )
  expect(response.ok(), await response.text()).toBe(true)
}

test('ativo: cria a assinatura, ativa o bar e o bar aparece na busca', async ({
  playwright,
  request
}) => {
  const { user, barId, spot } = await createRemotePub({
    subscription: null,
    bar: { is_active: false }
  })
  expect(await fanSearch(playwright, spot)).not.toContain(barId)

  const nextBillingDate = inDays(40)
  await deliver(request, 'subscription.active', {
    email: user.email,
    subscriptionId: `sub_e2e_${barId}`,
    plan: 'elite',
    nextBillingDate
  })

  expect(await stateOf(barId)).toEqual({
    status: 'active',
    plan: 'elite',
    dodo_subscription_id: `sub_e2e_${barId}`,
    current_period_end: nextBillingDate.toISOString(),
    is_active: true
  })
  expect(await fanSearch(playwright, spot)).toContain(barId)
})

test('renovado: assinatura parada volta a ativa, com o novo período', async ({
  request
}) => {
  const subscriptionId = `sub_e2e_${randomInt(1e9)}`
  const { user, barId } = await createPub({
    subscription: {
      plan: 'pro',
      status: 'past_due',
      dodoSubscriptionId: subscriptionId
    }
  })

  const nextBillingDate = inDays(60)
  await deliver(request, 'subscription.renewed', {
    email: user.email,
    subscriptionId,
    plan: 'pro',
    nextBillingDate
  })

  expect(await stateOf(barId)).toMatchObject({
    status: 'active',
    plan: 'pro',
    current_period_end: nextBillingDate.toISOString(),
    is_active: true
  })
})

for (const type of ['subscription.on_hold', 'subscription.failed'] as const) {
  test(`${type}: vira past_due e o painel avisa o pagamento pendente`, async ({
    page,
    request
  }) => {
    const subscriptionId = `sub_e2e_${randomInt(1e9)}`
    const { user, barId } = await createPub({
      subscription: {
        plan: 'pro',
        status: 'active',
        dodoSubscriptionId: subscriptionId
      }
    })

    await deliver(request, type, {
      email: user.email,
      subscriptionId,
      plan: 'pro'
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

test('cancelado: desativa a assinatura e o bar some da busca', async ({
  playwright,
  request
}) => {
  const subscriptionId = `sub_e2e_${randomInt(1e9)}`
  const { user, barId, spot } = await createRemotePub({
    subscription: {
      plan: 'elite',
      status: 'active',
      dodoSubscriptionId: subscriptionId
    }
  })
  expect(await fanSearch(playwright, spot)).toContain(barId)

  await deliver(request, 'subscription.cancelled', {
    email: user.email,
    subscriptionId,
    plan: 'elite'
  })

  expect(await stateOf(barId)).toMatchObject({
    status: 'inactive',
    is_active: false
  })
  expect(await fanSearch(playwright, spot)).not.toContain(barId)
})
