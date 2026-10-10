import { randomUUID } from 'node:crypto'
import type { Page } from '@playwright/test'
import { BASE_URL, STUB_URL } from '../../env'
import { signIn } from '../../fixtures/auth'
import { query } from '../../fixtures/db'
import { createPub, type PubOptions } from '../../fixtures/pubs'
import { stripeSubscription } from '../../fixtures/stripe'
import { expect, test } from '../../fixtures/test'

// /admin/billing: plano atual e portal do Stripe, onde ficam faturas, cartão,
// troca de plano e cancelamento. A API do Stripe é o stub (`stubs/server.ts`):
// portal em `${STUB_URL}/stripe/portal/<customer>`.

async function openBilling(page: Page, options: PubOptions = {}) {
  const pub = await createPub(options)
  await signIn(page, pub.user)
  await page.goto('/admin/billing')
  return pub
}

const currentPlan = (page: Page) =>
  page.locator('section').filter({
    has: page.getByRole('heading', { name: 'Plano atual' })
  })

const cancelShortcut = (page: Page) =>
  page.getByRole('button', { name: 'Cancelar assinatura' })

test('o painel leva à cobrança e à validação', async ({ page }) => {
  const pub = await createPub()
  await signIn(page, pub.user)
  await page.goto('/admin')

  await page.getByRole('link', { name: 'Assinatura e pagamentos' }).click()
  await expect(page).toHaveURL(/\/admin\/billing$/)
  await expect(
    page.getByRole('heading', { level: 1, name: 'Assinatura e pagamentos' })
  ).toBeVisible()

  await page.goto('/admin')
  await page.getByRole('link', { name: 'Validar código' }).click()
  await expect(page).toHaveURL(/\/admin\/validate$/)
})

test('a assinatura aparece sem esperar a consulta do cupom ao Stripe (WEB-348)', async ({
  page
}) => {
  const pub = await createPub()
  await signIn(page, pub.user)
  // `getFounderCouponAvailable` consulta o Stripe. Aqui ela nunca responde: se
  // voltar a viajar no mesmo lote HTTP da assinatura, o plano não aparece.
  let held = 0
  await page.route(/\/api\/trpc\/[^?]*pub\.getFounderCouponAvailable/, () => {
    held += 1
  })
  await page.goto('/admin/billing')

  await expect(currentPlan(page)).toContainText('Elite')
  expect(held).toBe(1)
  await page.unrouteAll({ behavior: 'ignoreErrors' })
})

test('Elite ativo: plano e portal do Stripe', async ({ page }) => {
  // O portal só existe para quem tem cliente no Stripe (WEB-264): o id da
  // assinatura e o do cliente são o rastro de quem já passou pelo checkout.
  const pub = await createPub({
    subscription: {
      externalSubscriptionId: `sub_e2e_${randomUUID()}`,
      monthlyDiscountReais: 28
    }
  })
  const customerId = `cus_e2e_${randomUUID()}`
  await query('UPDATE "user" SET stripe_customer_id = $1 WHERE id = $2', [
    customerId,
    pub.user.id
  ])
  await signIn(page, pub.user)
  await page.goto('/admin/billing')

  await expect(currentPlan(page)).toContainText('Elite')
  await expect(currentPlan(page)).toContainText('R$ 269')
  await expect(currentPlan(page)).toContainText('R$ 297')
  await expect(currentPlan(page)).toContainText('Ativo')
  await expect(currentPlan(page)).toContainText('Próxima cobrança em')
  await expect(
    currentPlan(page).getByRole('link', { name: 'Fazer upgrade' })
  ).toHaveCount(0)
  await expect(
    page.getByText(/faturas e os recibos de cada cobrança ficam no portal/)
  ).toBeVisible()

  const navigations: string[] = []
  page.on('request', (request) => {
    if (
      request.isNavigationRequest() &&
      request.url().startsWith(`${STUB_URL}/stripe/portal/`)
    ) {
      navigations.push(request.url())
    }
  })
  await page.getByRole('button', { name: 'Gerenciar assinatura' }).click()
  await expect(page).toHaveURL(`${STUB_URL}/stripe/portal/${customerId}`)
  // WEB-241: uma navegação só; a segunda abortava a primeira.
  expect(navigations).toHaveLength(1)
})

// WEB-339: o atalho abre o portal já no cancelamento, em português, pela
// rota do app (`pub.openSubscriptionCancel`), que antes confere a assinatura
// no Stripe.
test('assinatura ativa: "Cancelar assinatura" abre o portal no fluxo de cancelamento (WEB-339)', async ({
  page,
  request
}) => {
  const subscriptionId = `sub_e2e_${randomUUID()}`
  const customerId = `cus_e2e_${randomUUID()}`
  const pub = await createPub({
    subscription: { plan: 'pro', externalSubscriptionId: subscriptionId }
  })
  // O cliente fica no usuário e na linha do plugin, como o checkout grava.
  await query('UPDATE "user" SET stripe_customer_id = $1 WHERE id = $2', [
    customerId,
    pub.user.id
  ])
  await query(
    'UPDATE stripe_subscription SET stripe_customer_id = $1 WHERE stripe_subscription_id = $2',
    [customerId, subscriptionId]
  )
  const seeded = await request.post(`${STUB_URL}/stripe/subscriptions`, {
    data: stripeSubscription({
      id: subscriptionId,
      status: 'active',
      plan: 'pro',
      userId: pub.user.id,
      customerId
    })
  })
  expect(seeded.ok()).toBe(true)
  await signIn(page, pub.user)
  await page.goto('/admin/billing')

  await expect(currentPlan(page)).toContainText(
    '“Cancelar assinatura” abre o portal direto no cancelamento.'
  )
  // Ação secundária: "Gerenciar assinatura" segue sendo o botão do card.
  await expect(
    currentPlan(page).getByRole('button', { name: 'Gerenciar assinatura' })
  ).toBeVisible()
  await cancelShortcut(page).click()
  await expect(page).toHaveURL(`${STUB_URL}/stripe/portal/${customerId}`)

  const calls = (await (
    await page.request.get(`${STUB_URL}/stripe/calls`)
  ).json()) as { path: string; body: Record<string, string> }[]
  const sessions = calls.filter(
    (call) =>
      call.path === '/billing_portal/sessions' &&
      call.body.customer === customerId
  )
  expect(sessions).toHaveLength(1)
  expect(sessions[0]?.body).toMatchObject({
    'flow_data[type]': 'subscription_cancel',
    'flow_data[subscription_cancel][subscription]': subscriptionId,
    locale: 'pt-BR',
    return_url: `${BASE_URL}/admin/billing`
  })
})

test('Elite ativo sem desconto gravado: mostra só a tabela cheia', async ({
  page
}) => {
  await openBilling(page, {
    subscription: {
      plan: 'elite',
      monthlyDiscountReais: 0,
      externalSubscriptionId: `sub_e2e_${randomUUID()}`
    }
  })
  await expect(currentPlan(page)).toContainText('R$ 297')
  await expect(currentPlan(page)).not.toContainText('R$ 269')
})

test('Starter vê o caminho para o upgrade', async ({ page }) => {
  await openBilling(page, { subscription: { plan: 'starter' } })
  await expect(currentPlan(page)).toContainText('Starter')
  await expect(
    currentPlan(page).getByRole('link', { name: 'Fazer upgrade' })
  ).toHaveAttribute('href', '/plan?origin=billing')
})

test('pagamento atrasado mostra o plano parado e manda regularizar', async ({
  page
}) => {
  await openBilling(page, {
    subscription: { plan: 'pro', status: 'past_due' }
  })
  await expect(currentPlan(page)).toContainText('Pro')
  await expect(currentPlan(page)).toContainText('Pagamento pendente')
  await expect(currentPlan(page)).toContainText(
    'O último pagamento não foi confirmado.'
  )
})

test('trial vigente mostra "Trial gratuito" e até quando', async ({ page }) => {
  await openBilling(page, {
    subscription: { plan: 'pro', status: 'trialing' }
  })
  await expect(currentPlan(page)).toContainText('Pro')
  await expect(currentPlan(page)).toContainText('Trial gratuito até')
  await expect(currentPlan(page)).toContainText(/faltam \d+ dias/)
  // WEB-343: sem cupom de fundador (o padrão), o card mostra a tabela cheia.
  await expect(currentPlan(page)).toContainText('R$ 147')
  await expect(currentPlan(page)).not.toContainText('R$ 119')
  // WEB-264: trial do cadastro não tem cliente no Stripe — sem portal para
  // abrir e sem pagamento; o caminho é contratar em `/plan` (WEB-31).
  await expect(
    page.getByText('Nenhum pagamento registrado ainda.')
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Gerenciar assinatura' })
  ).toHaveCount(0)
  // WEB-339: sem assinatura no Stripe não há o que cancelar lá.
  await expect(cancelShortcut(page)).toHaveCount(0)
  await expect(
    currentPlan(page).getByText('O teste grátis não pede cartão.')
  ).toBeVisible()
  await expect(
    currentPlan(page).getByRole('link', { name: 'Contratar plano' })
  ).toHaveAttribute('href', '/plan?origin=billing')
})

test('trial vencido sem pagamento mostra "Trial encerrado"', async ({
  page
}) => {
  await openBilling(page, {
    subscription: {
      plan: 'elite',
      status: 'trialing',
      currentPeriodEnd: new Date(Date.now() - 86_400_000)
    }
  })
  await expect(currentPlan(page)).toContainText('Elite')
  await expect(currentPlan(page)).toContainText('Trial encerrado')
  await expect(currentPlan(page)).toContainText(
    'O trial gratuito terminou sem pagamento confirmado.'
  )
  // WEB-357: sem contratar, esse bar sai do ar; não são só os recursos.
  await expect(currentPlan(page)).toContainText(
    'O bar sai das buscas e do mapa até um plano ser contratado.'
  )
  // WEB-249: sem assinatura no provedor não há o que regularizar no portal;
  // o caminho para pagar é o checkout em `/plan`.
  await expect(
    currentPlan(page).getByRole('link', { name: 'Continuar no Elite' })
  ).toHaveAttribute('href', '/plan?origin=billing')
  await expect(currentPlan(page)).not.toContainText(
    'Atualize o método de pagamento'
  )
})

// WEB-60: quem cancelou lê "Cancelado"; "Inativo" fica para a cobrança
// pausada. Nos dois o plano contratado aparece, sem próxima cobrança.
for (const [status, label] of [
  ['cancelled', 'Cancelado'],
  ['inactive', 'Inativo']
] as const) {
  test(`assinatura ${status} mostra "${label}" e o caminho para contratar`, async ({
    page
  }) => {
    await openBilling(page, {
      subscription: {
        plan: 'pro',
        status,
        externalSubscriptionId: `sub_e2e_${randomUUID()}`
      },
      bar: { is_active: false }
    })
    await expect(currentPlan(page)).toContainText('Pro')
    await expect(currentPlan(page)).toContainText(label)
    await expect(currentPlan(page)).toContainText('Assinatura encerrada')
    await expect(currentPlan(page)).not.toContainText('Próxima cobrança')
    await expect(cancelShortcut(page)).toHaveCount(0)
    await expect(
      currentPlan(page).getByRole('link', { name: 'Contratar plano' })
    ).toHaveAttribute('href', '/plan?origin=billing')
  })
}

// WEB-344: o plano do card não volta em "Outros planos", e a Visão geral não
// chama de "Plano atual" a assinatura que acabou.
test('assinatura encerrada: "Outros planos" e a Visão geral seguem o card', async ({
  page
}) => {
  await openBilling(page, {
    subscription: {
      plan: 'starter',
      status: 'cancelled',
      externalSubscriptionId: `sub_e2e_${randomUUID()}`
    },
    bar: { is_active: false }
  })
  await expect(currentPlan(page)).toContainText('Starter')
  const others = page.getByRole('complementary').filter({
    has: page.getByRole('heading', { name: 'Outros planos' })
  })
  await expect(
    others.getByRole('link', { name: 'Contratar Pro' })
  ).toBeVisible()
  await expect(others.getByRole('link', { name: /Starter/ })).toHaveCount(0)

  await page.goto('/admin')
  const overview = page.locator('#admin-visao')
  await expect(
    overview.getByText('Assinatura encerrada', { exact: true })
  ).toBeVisible()
  await expect(overview).not.toContainText('Plano atual')
  await expect(overview).toContainText(
    'Plano: Starter • Assinatura do plano Starter encerrada'
  )
})

test('bar sem assinatura', async ({ page }) => {
  await openBilling(page, { subscription: null })
  await expect(
    page.getByText('Nenhuma assinatura ativa encontrada.')
  ).toBeVisible()
})

test('a fixture grava current_period_end em UTC em qualquer fuso (WEB-197)', async () => {
  const end = new Date('2030-01-15T12:00:00.000Z')
  const tz = process.env.TZ
  process.env.TZ = 'America/Sao_Paulo'
  let pub: Awaited<ReturnType<typeof createPub>>
  try {
    pub = await createPub({ subscription: { currentPeriodEnd: end } })
  } finally {
    if (tz === undefined) delete process.env.TZ
    else process.env.TZ = tz
  }
  const [row] = await query<{ end: string }>(
    `SELECT to_char(current_period_end, 'YYYY-MM-DD"T"HH24:MI:SS') AS end
     FROM subscription WHERE bar_id = $1`,
    [pub.barId]
  )
  expect(row?.end).toBe('2030-01-15T12:00:00')
})
