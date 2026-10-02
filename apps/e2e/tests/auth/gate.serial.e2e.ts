import { randomUUID } from 'node:crypto'
import { query, resetAppConfig, setAppConfig } from '../../fixtures/db'
import { expect, test } from '../../fixtures/test'
import { createUser, DEFAULT_PASSWORD } from '../../fixtures/users'

// WEB-175 — portão da waitlist ABERTO: muda `app_config`, por isso serial.

test.beforeEach(async () => {
  await setAppConfig('launch.waitlist_gate', { signup: false })
})

test.afterEach(async () => {
  await resetAppConfig()
})

async function admittedAt(email: string) {
  const [row] = await query<{ admitted_at: Date | null }>(
    'SELECT admitted_at FROM "user" WHERE email = $1',
    [email]
  )
  return row?.admitted_at ?? null
}

test('cadastro sem waitlist passa e admite a conta', async ({ page }) => {
  const email = `gate-aberto-${randomUUID()}@e2e.test`
  await page.goto('/signup')
  // O aviso de convite some com o portão aberto.
  await expect(
    page.getByRole('button', { name: 'Entrar no time' })
  ).toBeVisible()
  await expect(
    page.getByText('A Onside está abrindo por convite.')
  ).toHaveCount(0)

  await page.getByLabel('Nome completo').fill('Sem fila')
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha', { exact: true }).fill(DEFAULT_PASSWORD)
  await page
    .getByLabel('Confirmar senha', { exact: true })
    .fill(DEFAULT_PASSWORD)
  await page.getByRole('button', { name: 'Entrar no time' }).click()

  await expect(page).toHaveURL(/\/verify-email$/)
  expect(await admittedAt(email)).not.toBeNull()
})

test('login admite conta que ainda não estava admitida', async ({ page }) => {
  const user = await createUser({ admitted: false })
  await page.goto('/login')
  await page.getByLabel('E-mail').fill(user.email)
  await page.getByLabel('Senha', { exact: true }).fill(user.password)
  await page.getByRole('button', { name: 'Acessar minha conta' }).click()

  await expect(page).toHaveURL(/\/dashboard$/)
  expect(await admittedAt(user.email)).not.toBeNull()
})
