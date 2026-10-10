import { randomUUID } from 'node:crypto'
import type { Page } from '@playwright/test'
import { signIn } from '../../fixtures/auth'
import { createPub, inDays } from '../../fixtures/pubs'
import { seedStripeBalance, stripeSubscription } from '../../fixtures/stripe'
import { expect, test } from '../../fixtures/test'

// WEB-350: o crédito proporcional de um downgrade fica no saldo do cliente no
// Stripe e abate as faturas seguintes. `/admin/billing` mostra o saldo e o
// valor da próxima cobrança; `/plan` avisa antes da troca. A API do Stripe é
// o stub (`stubs/server.ts`).

const CREDIT_NOTICE =
  'A diferença vira crédito na sua conta e abate as próximas mensalidades (não é reembolsada no cartão).'

const currentPlan = (page: Page) =>
  page.locator('section').filter({
    has: page.getByRole('heading', { name: 'Plano atual' })
  })

test('bar com crédito vê o saldo e o valor da próxima cobrança', async ({
  page,
  request
}) => {
  const subscriptionId = `sub_e2e_${randomUUID()}`
  const pub = await createPub({
    subscription: { plan: 'starter', externalSubscriptionId: subscriptionId }
  })
  // Os números do ticket: R$ 198,70 de crédito cobrem a mensalidade de R$ 69.
  await seedStripeBalance(
    request,
    stripeSubscription({
      id: subscriptionId,
      status: 'active',
      plan: 'starter',
      userId: pub.user.id
    }),
    { balance: -19870, nextAmountDue: 0 }
  )
  await signIn(page, pub.user)
  await page.goto('/admin/billing')

  await expect(currentPlan(page)).toContainText('Próxima cobrança em')
  await expect(currentPlan(page)).toContainText(
    /Valor da próxima cobrança:\sR\$\s0,00/
  )
  await expect(currentPlan(page)).toContainText(
    /Você tem R\$\s198,70 de crédito; as próximas cobranças serão descontadas dele\./
  )
})

test('sem crédito: só o valor da próxima cobrança', async ({
  page,
  request
}) => {
  const subscriptionId = `sub_e2e_${randomUUID()}`
  const pub = await createPub({
    subscription: { plan: 'starter', externalSubscriptionId: subscriptionId }
  })
  await seedStripeBalance(
    request,
    stripeSubscription({
      id: subscriptionId,
      status: 'active',
      plan: 'starter',
      userId: pub.user.id
    }),
    { balance: 0, nextAmountDue: 6900 }
  )
  await signIn(page, pub.user)
  await page.goto('/admin/billing')

  await expect(currentPlan(page)).toContainText(
    /Valor da próxima cobrança:\sR\$\s69,00/
  )
  await expect(currentPlan(page).getByText(/de crédito/)).toHaveCount(0)
})

// O cliente tRPC agrupa em lote o que é pedido na mesma renderização, e o lote
// só responde quando a última chamada termina. O bloco do saldo só monta
// depois que a assinatura chegou, então a consulta dele sai num pedido à
// parte: Stripe lento não deixa o card em "Carregando assinatura…".
test('consulta do saldo pendente não segura o card do plano', async ({
  page,
  request
}) => {
  const subscriptionId = `sub_e2e_${randomUUID()}`
  const pub = await createPub({
    subscription: { plan: 'starter', externalSubscriptionId: subscriptionId }
  })
  await seedStripeBalance(
    request,
    stripeSubscription({
      id: subscriptionId,
      status: 'active',
      plan: 'starter',
      userId: pub.user.id
    }),
    { balance: -19870, nextAmountDue: 0 }
  )
  let release = () => {}
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  const urls: string[] = []
  await page.route(/\/api\/trpc\/[^?]*getMyBillingBalance/, async (route) => {
    urls.push(route.request().url())
    await held
    await route.continue()
  })
  await signIn(page, pub.user)
  await page.goto('/admin/billing')

  // Com a consulta do saldo parada, o card já mostra o plano.
  await expect(currentPlan(page)).toContainText('Starter')
  await expect(currentPlan(page)).toContainText('Próxima cobrança em')
  await expect.poll(() => urls.length).toBe(1)
  expect(urls[0]).not.toContain('getMySubscription')
  await expect(currentPlan(page).getByText(/de crédito/)).toHaveCount(0)

  release()
  await expect(currentPlan(page)).toContainText(
    /Você tem R\$\s198,70 de crédito/
  )
})

test('Stripe sem resposta para a assinatura: o card aparece como antes, sem o saldo', async ({
  page
}) => {
  // Assinatura que o stub não conhece: as duas leituras voltam 404.
  const pub = await createPub({
    subscription: { externalSubscriptionId: `sub_e2e_${randomUUID()}` }
  })
  await signIn(page, pub.user)
  const balance = page.waitForResponse((response) =>
    response.url().includes('pub.getMyBillingBalance')
  )
  await page.goto('/admin/billing')

  expect((await balance).ok()).toBe(true)
  await expect(currentPlan(page)).toContainText('Elite')
  await expect(currentPlan(page)).toContainText('Próxima cobrança em')
  await expect(
    currentPlan(page).getByText(/Valor da próxima cobrança|de crédito/)
  ).toHaveCount(0)
})

test('/plan avisa que a diferença do downgrade vira crédito', async ({
  page
}) => {
  const { user } = await createPub({
    subscription: {
      plan: 'elite',
      externalSubscriptionId: `sub_e2e_${randomUUID()}`
    }
  })
  await signIn(page, user)
  await page.goto('/plan')

  // Espera a assinatura chegar: antes disso a tela ainda muda de altura, e o
  // clique forçado cai fora do rádio.
  await expect(
    page.getByRole('heading', { name: 'Escolha seu novo plano.' })
  ).toBeVisible()
  await expect(page.getByText(CREDIT_NOTICE)).toHaveCount(0)
  await page.getByRole('radio', { name: /^Pro,/ }).check({ force: true })
  await expect(page.getByText(/plano inferior ao atual/)).toBeVisible()
  await expect(page.getByText(CREDIT_NOTICE)).toBeVisible()
})

test('/plan em teste grátis: plano menor não promete crédito', async ({
  page
}) => {
  const { user } = await createPub({
    subscription: {
      plan: 'elite',
      status: 'trialing',
      currentPeriodEnd: inDays(14)
    }
  })
  await signIn(page, user)
  await page.goto('/plan')

  await expect(
    page.getByRole('heading', { name: /^Você está no trial do Elite até / })
  ).toBeVisible()
  await page.getByRole('radio', { name: /^Pro,/ }).check({ force: true })
  await expect(page.getByText(/plano inferior ao atual/)).toBeVisible()
  await expect(page.getByText(CREDIT_NOTICE)).toHaveCount(0)
})
