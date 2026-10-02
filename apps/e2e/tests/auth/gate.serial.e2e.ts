import { resetAppConfig, setAppConfig } from '../../fixtures/db'
import { expect, test } from '../../fixtures/test'
import { createUser } from '../../fixtures/users'
import { admittedAt, loginWithForm, submitSignup, uniqueEmail } from './forms'

// WEB-175 — portão da waitlist ABERTO: muda `app_config`, por isso serial.

test.beforeEach(async () => {
  await setAppConfig('launch.waitlist_gate', { signup: false })
})

test.afterEach(async () => {
  await resetAppConfig()
})

test('cadastro sem waitlist passa e admite a conta', async ({ page }) => {
  const email = uniqueEmail('gate-aberto')
  await page.goto('/signup')
  // O aviso de convite some com o portão aberto.
  await expect(
    page.getByRole('button', { name: 'Entrar no time' })
  ).toBeVisible()
  await expect(
    page.getByText('A Onside está abrindo por convite.')
  ).toHaveCount(0)

  await submitSignup(page, { name: 'Sem fila', email })

  await expect(page).toHaveURL(/\/verify-email$/)
  expect(await admittedAt(email)).not.toBeNull()
})

test('login admite conta que ainda não estava admitida', async ({ page }) => {
  const user = await createUser({ admitted: false })
  await loginWithForm(page, user)

  await expect(page).toHaveURL(/\/dashboard$/)
  expect(await admittedAt(user.email)).not.toBeNull()
})
