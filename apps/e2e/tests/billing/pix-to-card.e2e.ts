import { randomUUID } from 'node:crypto'
import type { Page } from '@playwright/test'
import { STUB_URL } from '../../env'
import { pixCancels, seedPixSubscription } from '../../fixtures/abacatepay'
import { signIn } from '../../fixtures/auth'
import { query } from '../../fixtures/db'
import { print } from '../../fixtures/prints'
import { createPub, inDays } from '../../fixtures/pubs'
import { deliverSubscription, stripeSubscription } from '../../fixtures/stripe'
import { expect, test } from '../../fixtures/test'

// Do Pix para o cartão (WEB-536). O Pix fica fora das telas no E2E (sem o
// segredo do webhook), mas quem já paga por Pix vê a janela com o cartão, e o
// servidor cancela o Pix no stub da AbacatePay quando o cartão se confirma.

const ddmm = (date: Date) =>
  date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'America/Sao_Paulo'
  })

async function checkoutSessionOf(page: Page, userId: string) {
  const calls = (await (
    await page.request.get(`${STUB_URL}/stripe/calls`)
  ).json()) as { path: string; body: Record<string, string> }[]
  return calls.find(
    (call) =>
      call.path === '/checkout/sessions' &&
      call.body['metadata[userId]'] === userId
  )?.body
}

async function pixBar(page: Page) {
  // Meio-dia de Brasília: o dd/mm é o mesmo em qualquer fuso do navegador.
  const paidUntil = inDays(18)
  paidUntil.setUTCHours(15, 0, 0, 0)
  const pixId = `subs_e2e_${randomUUID().slice(0, 8)}`
  const pub = await createPub({
    subscription: {
      plan: 'pro',
      status: 'active',
      provider: 'abacatepay',
      externalSubscriptionId: pixId,
      currentPeriodEnd: paidUntil
    }
  })
  await seedPixSubscription(page.request, pixId, paidUntil)
  await signIn(page, pub.user)
  return { ...pub, pixId, paidUntil }
}

/** O que o app pediu ao Stripe para a assinatura (`POST /v1/subscriptions/<id>`). */
async function subscriptionCalls(page: Page, id: string) {
  const calls = (await (
    await page.request.get(`${STUB_URL}/stripe/calls`)
  ).json()) as { method: string; path: string; body: Record<string, string> }[]
  return calls.filter((call) => call.path === `/subscriptions/${id}`)
}

test('subida do Pix para o cartão: a diferença sai no checkout e só paga o Pix é cancelado', async ({
  page,
  request
}) => {
  const { user, barId, pixId, paidUntil } = await pixBar(page)
  await page.goto('/plan')

  await page.getByRole('button', { name: 'Mudar para o Elite' }).click()
  const dialog = page.getByRole('dialog', { name: 'Como você quer pagar?' })
  await expect(dialog.getByText('Mudar para o Elite')).toBeVisible()
  const card = dialog.getByRole('radio', { name: /Cartão de crédito/ })
  await expect(card).toHaveAttribute('aria-checked', 'true')
  await expect(card).toContainText(`PAGO ATÉ ${ddmm(paidUntil)}`)
  await expect(dialog.getByText('Nada é cobrado em dobro.')).toBeVisible()
  // Subida (dono, 14/11/2026): a diferença até o fim do mês pago sai hoje.
  const note = dialog.getByRole('note')
  await expect(note).toContainText(
    new RegExp(
      `Hoje: R\\$ [\\d.]+,\\d{2} da diferença até ${ddmm(paidUntil)}\\. Depois, R\\$ 269 por mês\\.`
    )
  )
  const shown = Number(
    (
      /Hoje: R\$ ([\d.]+,\d{2})/.exec((await note.textContent()) ?? '')?.[1] ??
      ''
    )
      .replaceAll('.', '')
      .replace(',', '')
  )

  await dialog.getByRole('button', { name: 'Passar para o cartão' }).click()
  await page.waitForURL(`${STUB_URL}/stripe/checkout/**`)
  const session = await checkoutSessionOf(page, user.id)
  expect(session).toMatchObject({
    'subscription_data[trial_end]': String(
      Math.floor(paidUntil.getTime() / 1000)
    )
  })
  const upgradeCents = Number(
    session?.['subscription_data[metadata][pixUpgradeCents]']
  )
  // A tela e o checkout fazem a mesma conta, segundos depois.
  expect(Math.abs(upgradeCents - shown)).toBeLessThanOrEqual(1)
  // A diferença é item avulso da sessão: o Stripe a cobra na tela dele, e o
  // cupom de fundador espera o webhook (no item, tiraria R$ 28 da diferença).
  expect(session).toMatchObject({
    'line_items[0][price]': 'price_e2e_elite_monthly',
    'line_items[1][price_data][unit_amount]': String(upgradeCents),
    'line_items[1][price_data][currency]': 'brl',
    'subscription_data[metadata][founderCoupon]': 'eM7dQpMF'
  })
  expect(session).not.toHaveProperty('discounts[0][coupon]')
  // O checkout não cancela nada: o Pix só sai com o cartão confirmado.
  expect(await pixCancels(request)).not.toContain(pixId)

  const subId = `sub_e2e_${randomUUID()}`
  const delivered = await deliverSubscription(
    request,
    'customer.subscription.created',
    stripeSubscription({
      id: subId,
      status: 'trialing',
      plan: 'elite',
      userId: user.id,
      currentPeriodEnd: paidUntil,
      metadata: {
        pixUpgradeCents: String(upgradeCents),
        founderCoupon: 'eM7dQpMF'
      },
      latestInvoice: { status: 'paid', amount_paid: upgradeCents }
    })
  )
  expect(delivered.ok()).toBe(true)
  expect(await pixCancels(request)).toContain(pixId)
  // Paga a diferença, o cupom de fundador entra na assinatura.
  expect(
    (await subscriptionCalls(page, subId)).some(
      (call) => call.body['discounts[0][coupon]'] === 'eM7dQpMF'
    )
  ).toBe(true)
  const [row] = await query<{
    provider: string
    plan: string
    external_subscription_id: string
    is_active: boolean
  }>(
    `SELECT s.provider, s.plan, s.external_subscription_id, b.is_active
       FROM subscription s JOIN bar b ON b.id = s.bar_id WHERE s.bar_id = $1`,
    [barId]
  )
  expect(row).toEqual({
    provider: 'stripe',
    plan: 'elite',
    external_subscription_id: subId,
    is_active: true
  })
})

test('cartão recusado na diferença: nada muda e a tela pede outro cartão', async ({
  page,
  request
}, testInfo) => {
  if (process.env.E2E_PRINTS_DIR) {
    await page.setViewportSize(
      testInfo.project.name === 'mobile'
        ? { width: 390, height: 844 }
        : { width: 1440, height: 900 }
    )
  }
  const { user, barId, pixId, paidUntil } = await pixBar(page)
  await page.goto('/plan')
  await page.getByRole('button', { name: 'Mudar para o Elite' }).click()
  const dialog = page.getByRole('dialog', { name: 'Como você quer pagar?' })
  await dialog.getByRole('button', { name: 'Passar para o cartão' }).click()
  await page.waitForURL(`${STUB_URL}/stripe/checkout/**`)
  const session = await checkoutSessionOf(page, user.id)

  // O Stripe recusa o cartão na tela dele, e o dono volta sem concluir.
  await page.goto(session?.cancel_url ?? '')
  const alert = page.getByRole('alert').filter({
    hasText: 'A troca para o cartão não foi concluída.'
  })
  await expect(alert).toContainText(
    `Nada mudou: o bar segue no Pro, pago no Pix até ${ddmm(paidUntil)}. Se o cartão foi recusado, tente outro.`
  )
  await print(page, testInfo, 'pix-cartao-recusado', 300)

  // Assinatura que nascesse sem a diferença paga: cancelada, e o Pix fica.
  const subId = `sub_e2e_${randomUUID()}`
  const delivered = await deliverSubscription(
    request,
    'customer.subscription.created',
    stripeSubscription({
      id: subId,
      status: 'trialing',
      plan: 'elite',
      userId: user.id,
      currentPeriodEnd: paidUntil,
      metadata: {
        pixUpgradeCents:
          session?.['subscription_data[metadata][pixUpgradeCents]'] ?? '1',
        founderCoupon: 'eM7dQpMF'
      },
      latestInvoice: { status: 'open', amount_paid: 0 }
    })
  )
  expect(delivered.ok()).toBe(true)
  expect(await pixCancels(request)).not.toContain(pixId)
  expect(
    (await subscriptionCalls(page, subId)).some(
      (call) => call.method === 'DELETE'
    )
  ).toBe(true)
  const [row] = await query<{
    provider: string
    plan: string
    external_subscription_id: string
    is_active: boolean
  }>(
    `SELECT s.provider, s.plan, s.external_subscription_id, b.is_active
       FROM subscription s JOIN bar b ON b.id = s.bar_id WHERE s.bar_id = $1`,
    [barId]
  )
  expect(row).toEqual({
    provider: 'abacatepay',
    plan: 'pro',
    external_subscription_id: pixId,
    is_active: true
  })

  // "Tentar outro cartão" volta à janela do mesmo plano.
  await alert.getByRole('button', { name: 'Tentar outro cartão' }).click()
  await expect(dialog.getByText('Mudar para o Elite')).toBeVisible()
})

test('quem paga por Pix passa o mesmo plano para o cartão', async ({
  page
}) => {
  const { user, paidUntil } = await pixBar(page)
  await page.goto('/plan')
  // O cabeçalho diz a regra do Pix, não o proporcional do cartão.
  await expect(page.locator('.ob-sub')).toContainText(
    `Pago no Pix até ${ddmm(paidUntil)}`
  )
  await expect(page.getByText('acertada de forma proporcional')).toHaveCount(0)

  await page.getByRole('button', { name: 'Passar para o cartão' }).click()
  const dialog = page.getByRole('dialog', { name: 'Como você quer pagar?' })
  await expect(dialog.getByText('Pro no cartão')).toBeVisible()
  // Pix fora das telas e o mesmo plano: só o cartão.
  await expect(dialog.getByRole('radio')).toHaveCount(1)
  await expect(dialog.getByRole('note')).not.toContainText('Hoje:')

  await dialog.getByRole('button', { name: 'Passar para o cartão' }).click()
  await page.waitForURL(`${STUB_URL}/stripe/checkout/**`)
  const session = await checkoutSessionOf(page, user.id)
  // Sem diferença: nada cobrado hoje, e o cupom vai na própria sessão.
  expect(session).not.toHaveProperty('line_items[1][price_data][unit_amount]')
  expect(session).toMatchObject({
    'discounts[0][coupon]': 'eM7dQpMF',
    'line_items[0][price]': 'price_e2e_pro_monthly',
    'subscription_data[trial_end]': String(
      Math.floor(paidUntil.getTime() / 1000)
    )
  })
})

// Prints da janela para o dono aprovar o texto (só com `E2E_PRINTS_DIR`):
// 1440 e 390, claro e escuro. Na troca de plano o Pix aparece como em
// produção, com a chave ligada: só a resposta de `getPaymentMethods` muda.
test('prints da janela de quem paga por Pix', async ({ page }, testInfo) => {
  test.skip(!process.env.E2E_PRINTS_DIR, 'só para revisão')
  const mobile = testInfo.project.name === 'mobile'
  await page.setViewportSize(
    mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 }
  )
  await page.route('**/api/trpc/**', async (route) => {
    if (!route.request().url().includes('pub.getPaymentMethods')) {
      return route.fallback()
    }
    const response = await route.fetch()
    const body = (await response.text()).replace('"pix":false', '"pix":true')
    return route.fulfill({ response, body })
  })
  await pixBar(page)
  await page.goto('/plan')
  await print(page, testInfo, 'plan-pix-cabecalho', 300)
  const dialog = page.getByRole('dialog', { name: 'Como você quer pagar?' })

  await page.getByRole('button', { name: 'Mudar para o Elite' }).click()
  await expect(dialog.getByRole('radio')).toHaveCount(2)
  await print(page, testInfo, 'pix-cartao-subida', 300)
  await dialog.getByRole('radio', { name: /Pix Automático/ }).click()
  await print(page, testInfo, 'pix-cartao-troca-pix', 300)
  await dialog.getByRole('button', { name: 'Voltar' }).click()

  await page.getByRole('button', { name: 'Passar para o cartão' }).click()
  await expect(dialog.getByRole('radio')).toHaveCount(1)
  await print(page, testInfo, 'pix-cartao-mesmo-plano', 300)
  await dialog.getByRole('button', { name: 'Voltar' }).click()
  await print(page, testInfo, 'pix-cartao-plan', 300)
})
