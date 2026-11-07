import { storageState } from '../../fixtures/auth'
import { expect, test } from '../../fixtures/test'
import { createUser } from '../../fixtures/users'

// Teste-sentinela (WEB-174): se isto quebra, nada mais na suíte vale.

test('landing carrega para visitante', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle(/Onside/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    /“Onde vai passar o jogo\?”\s+finalmente tem uma\s+\(ótima\)\s+resposta\./
  )

  // Landing v3 (WEB-501), com a copy do site: a chamada principal leva ao
  // Explorar, que abre sem conta. A lista de espera do app só volta com o
  // WEB-511.
  const main = page.getByRole('main')
  await expect(
    main.getByRole('link', { name: 'Ver jogos de hoje' }).first()
  ).toHaveAttribute('href', '/dashboard')
  await expect(page.locator('#email, #lista, #bar-form')).toHaveCount(0)
})

test('torcedor semeado entra pelo /login e chega no /dashboard', async ({
  page
}) => {
  const fan = await createUser({ role: 'fan' })

  await page.goto('/login')
  await page.getByLabel('E-mail').fill(fan.email)
  await page.getByLabel('Senha', { exact: true }).fill(fan.password)
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()

  await expect(page).toHaveURL(/\/dashboard$/)
})

for (const [role, home] of [
  ['fan', '/dashboard'],
  ['pub', '/admin'],
  ['admin', '/houdini']
] as const) {
  test.describe(`sessão pronta de ${role}`, () => {
    test.use({ storageState: storageState(role) })

    test(`abre ${home}`, async ({ page }) => {
      await page.goto(home)
      await expect(page).toHaveURL(new RegExp(`${home}$`))
    })
  })
}
