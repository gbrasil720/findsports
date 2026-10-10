import { randomUUID } from 'node:crypto'
import type { Page } from '@playwright/test'
import { signIn } from '../../fixtures/auth'
import { createPub, inDays } from '../../fixtures/pubs'
import { seedStripeBalance, stripeSubscription } from '../../fixtures/stripe'
import { expect, test } from '../../fixtures/test'

// WEB-350: o crédito proporcional de um downgrade fica no saldo do cliente no
// Stripe e abate as faturas seguintes. `/admin/billing` mostra o saldo e o
// valor da próxima cobrança; `/plan` avisa antes da troca, na confirmação de
// plano menor (`downgrade.serial.e2e.ts`). A API do Stripe é o stub
// (`stubs/server.ts`).

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
  // Assinatura sem forma de pagamento no Stripe: nenhuma linha de cartão.
  await expect(currentPlan(page).getByText(/Cartão/)).toHaveCount(0)
})

// Quem contrata durante o teste só é cobrado no fim dele: o que confirma que
// o cartão ficou salvo é esta linha, lida da assinatura no Stripe.
test('contratou no teste grátis: o card confirma o cartão salvo', async ({
  page,
  request
}) => {
  const subscriptionId = `sub_e2e_${randomUUID()}`
  const pub = await createPub({
    subscription: {
      plan: 'elite',
      status: 'trialing',
      currentPeriodEnd: inDays(100),
      externalSubscriptionId: subscriptionId
    }
  })
  await seedStripeBalance(
    request,
    stripeSubscription({
      id: subscriptionId,
      status: 'trialing',
      plan: 'elite',
      userId: pub.user.id,
      cardLast4: '4242'
    }),
    { balance: 0, nextAmountDue: 0 }
  )
  await signIn(page, pub.user)
  await page.goto('/admin/billing')

  await expect(currentPlan(page)).toContainText('Contratado · em teste')
  await expect(
    currentPlan(page).getByText('Cartão •••• 4242 salvo', { exact: true })
  ).toBeVisible()
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

// Na volta à janela, com os dados vencidos (60s), assinatura e saldo refazem
// no mesmo instante. O saldo vai ao Stripe: no lote, seguraria a assinatura.
test('refetch ao voltar à janela: o saldo não viaja no lote da assinatura', async ({
  page,
  request
}) => {
  await page.clock.install()
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
  await expect(currentPlan(page)).toContainText(/Valor da próxima cobrança/)

  const paths: string[] = []
  page.on('request', (sent) => {
    const { pathname } = new URL(sent.url())
    if (pathname.startsWith('/api/trpc/')) paths.push(pathname)
  })
  await page.clock.fastForward(61_000)
  // Em string: o tsconfig da suíte não carrega os tipos do DOM.
  await page.evaluate(`window.dispatchEvent(new Event('visibilitychange'))`)

  await expect
    .poll(() => paths.filter((path) => path.includes('getMySubscription')))
    .toHaveLength(1)
  await expect
    .poll(() => paths.filter((path) => path.includes('getMyBillingBalance')))
    .toEqual(['/api/trpc/pub.getMyBillingBalance'])
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
