import type { Page } from '@playwright/test'
import { STUB_URL } from '../../env'
import {
  deliverPixWebhook,
  pixCalls,
  seedPixSubscription
} from '../../fixtures/abacatepay'
import { signIn } from '../../fixtures/auth'
import { query } from '../../fixtures/db'
import { print } from '../../fixtures/prints'
import { createPub, inDays } from '../../fixtures/pubs'
import { setAnnualPrices } from '../../fixtures/stripe'
import { expect, test } from '../../fixtures/test'

// Pix anual: o seletor Mensal/Anual do /plan passa pela janela "Como você
// quer pagar?" também no anual, com o Pix do ano. Serial porque liga os
// preços anuais do stub do Stripe, que são globais.

test.afterEach(async ({ request }) => {
  await setAnnualPrices(request, false)
})

const ddmm = (date: Date) =>
  date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'America/Sao_Paulo'
  })

async function chooseAnnual(page: Page) {
  await page
    .getByRole('group', { name: 'Cobrança' })
    .getByRole('button', { name: /^Anual/ })
    .click()
}

async function subscriptionOf(barId: string) {
  const [row] = await query<{
    provider: string | null
    plan: string
    status: string
    billing_interval: string
    monthly_discount_reais: number | null
    pix_after_trial_at: Date | null
    external_subscription_id: string | null
  }>(
    `SELECT provider, plan, status, billing_interval, monthly_discount_reais,
            pix_after_trial_at, external_subscription_id
       FROM subscription WHERE bar_id = $1`,
    [barId]
  )
  return row
}

test('sem assinatura: Pix anual pelo seletor, com o produto do ano e o webhook gravando o anual', async ({
  page,
  request
}, testInfo) => {
  if (process.env.E2E_PRINTS_DIR) {
    await page.setViewportSize(
      testInfo.project.name.startsWith('mobile')
        ? { width: 390, height: 844 }
        : { width: 1440, height: 900 }
    )
  }
  await setAnnualPrices(request, true)
  const { user, barId } = await createPub({ subscription: null })
  await signIn(page, user)
  await page.goto('/plan')
  await chooseAnnual(page)

  await page
    .getByRole('button', { name: 'Contratar o Pro anual' })
    .first()
    .click()
  const dialog = page.getByRole('dialog', { name: 'Como você quer pagar?' })
  // O anual não vai mais direto ao cartão: cartão e Pix, com o preço do ano.
  await expect(dialog.getByRole('radio')).toHaveCount(2)
  await expect(dialog).toContainText('R$ 1.190')
  await expect(dialog).toContainText('por ano, no cartão ou no Pix')
  await print(page, testInfo, 'pix-anual', 300)

  await dialog.getByRole('radio', { name: /Pix Automático/ }).click()
  await expect(dialog).toContainText('o débito sai todo ano')
  await expect(dialog.getByRole('note')).toContainText(
    'O primeiro débito de R$ 1.190 sai hoje, quando você autorizar, e se repete todo ano nessa data.'
  )
  await print(page, testInfo, 'pix-anual-pix', 300)
  await dialog
    .getByRole('button', { name: 'Autorizar no app do banco' })
    .click()
  await page.waitForURL(`${STUB_URL}/abacatepay/checkout/**`)

  const calls = await pixCalls(request)
  const checkout = calls.findLast(
    (call) =>
      call.path === '/subscriptions/create' &&
      String(call.body?.externalId).includes(barId)
  )
  const externalId = String(checkout?.body?.externalId)
  // Fundador valendo (o padrão do stub): o produto de fundador do ano.
  expect(checkout?.body?.items).toEqual([
    { id: 'prod_e2e_pro_founder_yearly', quantity: 1 }
  ])
  expect(externalId.endsWith(':y')).toBe(true)

  const subId = `subs_e2e_${barId.slice(0, 8)}`
  const paidUntil = inDays(365)
  await seedPixSubscription(request, subId, paidUntil)
  const delivered = await deliverPixWebhook(
    request,
    'subscription.completed',
    subId,
    externalId
  )
  expect(delivered.ok()).toBe(true)
  expect(await subscriptionOf(barId)).toMatchObject({
    provider: 'abacatepay',
    plan: 'pro',
    status: 'active',
    billing_interval: 'year',
    monthly_discount_reais: 280,
    external_subscription_id: subId
  })

  // O placar diz o ano.
  await page.goto('/plan')
  await expect(
    page.getByRole('region', { name: 'Sua assinatura' })
  ).toContainText('R$ 1.190')
  await expect(
    page.getByRole('region', { name: 'Sua assinatura' })
  ).toContainText('Por ano')
})

test('teste do cadastro: o Pix anual escolhido espera o fim do teste', async ({
  page,
  request
}) => {
  await setAnnualPrices(request, true)
  const trialEnd = inDays(20)
  trialEnd.setUTCHours(15, 0, 0, 0)
  const { user, barId } = await createPub({
    subscription: {
      plan: 'pro',
      status: 'trialing',
      currentPeriodEnd: trialEnd
    }
  })
  await signIn(page, user)
  await page.goto('/plan')
  await chooseAnnual(page)

  await page
    .getByRole('button', { name: 'Contratar o Pro anual' })
    .last()
    .click()
  const dialog = page.getByRole('dialog', { name: 'Como você quer pagar?' })
  const pix = dialog.getByRole('radio', { name: /Pix Automático/ })
  await expect(pix).toContainText(`TESTE GRÁTIS ATÉ ${ddmm(trialEnd)}`)
  await pix.click()
  await expect(pix).toContainText('o débito sai todo ano')
  await dialog
    .getByRole('button', { name: 'Pagar com Pix no fim do teste' })
    .click()
  await page.waitForURL('**/admin/billing')

  const row = await subscriptionOf(barId)
  expect(row).toMatchObject({
    provider: null,
    status: 'trialing',
    billing_interval: 'year'
  })
  expect(row?.pix_after_trial_at).not.toBeNull()
})

test('quem paga Pix mensal passa para o Pix anual: autorização nova no mesmo plano', async ({
  page,
  request
}) => {
  await setAnnualPrices(request, true)
  const paidUntil = inDays(18)
  const pixId = `subs_e2e_${crypto.randomUUID().slice(0, 8)}`
  const { user, barId } = await createPub({
    subscription: {
      plan: 'pro',
      status: 'active',
      provider: 'abacatepay',
      externalSubscriptionId: pixId,
      currentPeriodEnd: paidUntil
    }
  })
  await seedPixSubscription(request, pixId, paidUntil)
  await signIn(page, user)
  await page.goto('/plan')
  await chooseAnnual(page)

  await page.getByRole('button', { name: 'Passar para o anual' }).click()
  const dialog = page.getByRole('dialog', { name: 'Como você quer pagar?' })
  await expect(dialog.getByText('Pro anual', { exact: true })).toBeVisible()
  await expect(dialog.getByRole('radio')).toHaveCount(2)
  await dialog.getByRole('radio', { name: /Pix Automático/ }).click()
  await expect(dialog.getByRole('note')).toContainText(
    'o Pix mensal do Pro é cancelado'
  )
  await dialog
    .getByRole('button', { name: 'Autorizar no app do banco' })
    .click()
  await page.waitForURL(`${STUB_URL}/abacatepay/checkout/**`)
  const checkout = (await pixCalls(request)).findLast(
    (call) =>
      call.path === '/subscriptions/create' &&
      String(call.body?.externalId).includes(barId)
  )
  // Vaga de fundador sobrando no stub: o produto de fundador do ano.
  expect(checkout?.body?.items).toEqual([
    { id: 'prod_e2e_pro_founder_yearly', quantity: 1 }
  ])
  expect(String(checkout?.body?.externalId).endsWith(':y')).toBe(true)
})
