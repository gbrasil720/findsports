import type { Page } from '@playwright/test'
import { STUB_URL } from '../../env'
import { signIn } from '../../fixtures/auth'
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
  await openBilling(page)

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

  await page.getByRole('button', { name: 'Gerenciar assinatura' }).click()
  await expect(page).toHaveURL(new RegExp(`^${STUB_URL}/dodo/portal/cus_e2e_`))
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
