import { storageState } from '../../fixtures/auth'
import { expect, test } from '../../fixtures/test'
import { createUser } from '../../fixtures/users'

// Teste-sentinela (WEB-174): se isto quebra, nada mais na suíte vale.

test('landing carrega para visitante', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle(/Onside/)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
})

test('torcedor semeado entra pelo /login e chega no /dashboard', async ({
  page
}) => {
  const fan = await createUser({ role: 'fan' })

  await page.goto('/login')
  await page.getByLabel('E-mail').fill(fan.email)
  await page.getByLabel('Senha', { exact: true }).fill(fan.password)
  await page.getByRole('button', { name: 'Acessar minha conta' }).click()

  await expect(page).toHaveURL(/\/dashboard$/)
})

for (const [role, home] of [
  ['fan', '/dashboard'],
  ['pub', '/admin'],
  ['admin', '/internal']
] as const) {
  test.describe(`sessão pronta de ${role}`, () => {
    test.use({ storageState: storageState(role) })

    test(`abre ${home}`, async ({ page }) => {
      await page.goto(home)
      await expect(page).toHaveURL(new RegExp(`${home}$`))
    })
  })
}
