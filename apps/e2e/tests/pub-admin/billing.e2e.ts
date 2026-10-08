import { randomUUID } from 'node:crypto'
import type { Page } from '@playwright/test'
import { STUB_URL } from '../../env'
import { signIn } from '../../fixtures/auth'
import { query } from '../../fixtures/db'
import { createPub, type PubOptions } from '../../fixtures/pubs'
import { expect, test } from '../../fixtures/test'

// /admin/billing: plano atual, histórico de pagamentos e portal da Dodo. A
// API da Dodo é o stub (`stubs/server.ts`): um pagamento de R$ 99,00 pago e
// portal em `${STUB_URL}/dodo/portal/<customer>`.

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

test('Elite ativo: plano, histórico e portal da Dodo', async ({ page }) => {
  // O histórico só é pedido à Dodo para quem tem cliente lá (WEB-264): o id
  // da assinatura é o rastro de quem já passou pelo checkout.
  await openBilling(page, {
    subscription: { dodoSubscriptionId: `sub_e2e_${randomUUID()}` }
  })

  await expect(currentPlan(page)).toContainText('Elite')
  await expect(currentPlan(page)).toContainText('Ativo')
  await expect(currentPlan(page)).toContainText('Próxima cobrança em')
  await expect(
    currentPlan(page).getByRole('link', { name: 'Fazer upgrade' })
  ).toHaveCount(0)

  const history = page.getByRole('region', { name: 'Histórico de pagamentos' })
  await expect(history.getByRole('listitem')).toHaveCount(1)
  await expect(history).toContainText(/R\$\s99,00/)
  await expect(history).toContainText('Pago')

  const navigations: string[] = []
  page.on('request', (request) => {
    if (
      request.isNavigationRequest() &&
      request.url().startsWith(`${STUB_URL}/dodo/portal/`)
    ) {
      navigations.push(request.url())
    }
  })
  await page.getByRole('button', { name: 'Gerenciar assinatura' }).click()
  await expect(page).toHaveURL(new RegExp(`^${STUB_URL}/dodo/portal/cus_e2e_`))
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
  // WEB-264: trial do onboarding não tem cliente na Dodo — o histórico é
  // vazio, sem perguntar ao provedor.
  await expect(
    page.getByText('Nenhum pagamento registrado ainda.')
  ).toBeVisible()
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
