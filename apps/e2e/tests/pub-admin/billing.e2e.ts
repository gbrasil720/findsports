import { randomUUID } from 'node:crypto'
import type { Page } from '@playwright/test'
import { STUB_URL } from '../../env'
import { signIn } from '../../fixtures/auth'
import { query } from '../../fixtures/db'
import { createPub, type PubOptions } from '../../fixtures/pubs'
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

test('Elite ativo: plano e portal do Stripe', async ({ page }) => {
  // O portal só existe para quem tem cliente no Stripe (WEB-264): o id da
  // assinatura e o do cliente são o rastro de quem já passou pelo checkout.
  const pub = await createPub({
    subscription: { externalSubscriptionId: `sub_e2e_${randomUUID()}` }
  })
  const customerId = `cus_e2e_${randomUUID()}`
  await query('UPDATE "user" SET stripe_customer_id = $1 WHERE id = $2', [
    customerId,
    pub.user.id
  ])
  await signIn(page, pub.user)
  await page.goto('/admin/billing')

  await expect(currentPlan(page)).toContainText('Elite')
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
  // WEB-264: trial do cadastro não tem cliente no Stripe — sem portal para
  // abrir e sem pagamento; o caminho é contratar em `/plan` (WEB-31).
  await expect(
    page.getByText('Nenhum pagamento registrado ainda.')
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Gerenciar assinatura' })
  ).toHaveCount(0)
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
  // WEB-249: sem assinatura no provedor não há o que regularizar no portal;
  // o caminho para pagar é o checkout em `/plan`.
  await expect(
    currentPlan(page).getByRole('link', { name: 'Continuar no Elite' })
  ).toHaveAttribute('href', '/plan?origin=billing')
  await expect(currentPlan(page)).not.toContainText(
    'Atualize o método de pagamento'
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
