import { randomUUID } from 'node:crypto'
import type { Page } from '@playwright/test'
import { STUB_URL } from '../../env'
import { pixCancels, seedPixSubscription } from '../../fixtures/abacatepay'
import { signIn } from '../../fixtures/auth'
import { query } from '../../fixtures/db'
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

test('quem paga por Pix muda de plano no cartão, que só cobra no fim do mês pago', async ({
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

  await dialog.getByRole('button', { name: 'Passar para o cartão' }).click()
  await page.waitForURL(`${STUB_URL}/stripe/checkout/**`)
  const session = await checkoutSessionOf(page, user.id)
  expect(session).toMatchObject({
    'subscription_data[trial_end]': String(
      Math.floor(paidUntil.getTime() / 1000)
    )
  })
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
      currentPeriodEnd: paidUntil
    })
  )
  expect(delivered.ok()).toBe(true)
  expect(await pixCancels(request)).toContain(pixId)

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

test('quem paga por Pix passa o mesmo plano para o cartão', async ({
  page
}) => {
  const { user, paidUntil } = await pixBar(page)
  await page.goto('/plan')

  await page.getByRole('button', { name: 'Passar para o cartão' }).click()
  const dialog = page.getByRole('dialog', { name: 'Como você quer pagar?' })
  await expect(dialog.getByText('Pro no cartão')).toBeVisible()
  // Pix fora das telas e o mesmo plano: só o cartão.
  await expect(dialog.getByRole('radio')).toHaveCount(1)

  await dialog.getByRole('button', { name: 'Passar para o cartão' }).click()
  await page.waitForURL(`${STUB_URL}/stripe/checkout/**`)
  expect(await checkoutSessionOf(page, user.id)).toMatchObject({
    'line_items[0][price]': 'price_e2e_pro_monthly',
    'subscription_data[trial_end]': String(
      Math.floor(paidUntil.getTime() / 1000)
    )
  })
})
