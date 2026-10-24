import { storageState } from '../../fixtures/auth'
import { createPub } from '../../fixtures/pubs'
import { expect, test } from '../../fixtures/test'

// Teste-sentinela (WEB-174): se isto quebra, nada mais na suíte vale.

test('landing carrega para visitante', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle(/Onside/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    '“Onde vai passar o jogo?” finalmente tem uma (ótima) resposta.'
  )

  // Landing v2 (WEB-333): a chamada principal leva ao cadastro, e a lista de
  // espera saiu da página.
  const main = page.getByRole('main')
  await expect(
    main.getByRole('link', { name: 'Entrar / Criar conta' }).first()
  ).toHaveAttribute('href', '/signup')
  await expect(main.locator('form')).toHaveCount(0)
  await expect(page.locator('#lista, #bar-form')).toHaveCount(0)
})

test('bar semeado entra pelo /login e chega no /admin', async ({ page }) => {
  const { user } = await createPub()

  await page.goto('/login')
  await page.getByLabel('E-mail').fill(user.email)
  await page.getByLabel('Senha', { exact: true }).fill(user.password)
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()

  await expect(page).toHaveURL(/\/admin$/)
})

for (const [role, home] of [
  ['fan', '/torcedor'],
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
