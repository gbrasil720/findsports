import { storageState } from '../../fixtures/auth'
import { expect, test } from '../../fixtures/test'
import { createUser } from '../../fixtures/users'
import { loginWithForm } from './forms'

// O web é só para bares: admin fora do Houdini é como torcedor e vai à página
// do app. O Houdini só abre quando pedido (o endereço, o `callbackUrl` da
// Entrada).

test.describe('sessão de admin', () => {
  test.use({ storageState: storageState('admin') })

  test('abre a landing, e "Ir para o app" leva à página do app', async ({
    page
  }) => {
    const response = await page.goto('/')
    expect(response?.status()).toBe(200)
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    await page.getByRole('link', { name: 'Ir para o app' }).first().click()
    await expect(page).toHaveURL(/\/torcedor$/)
  })
})

test('login de admin pela tela cai na página do app', async ({ page }) => {
  await loginWithForm(page, await createUser({ role: 'admin' }))
  await expect(page).toHaveURL(/\/torcedor$/)
})

test('login de admin pedindo o Houdini cai no Houdini', async ({ page }) => {
  await loginWithForm(
    page,
    await createUser({ role: 'admin' }),
    '/login?callbackUrl=%2Fhoudini'
  )
  await expect(page).toHaveURL(/\/houdini$/)
  // Sem 2FA, o Houdini pede o segundo fator antes das seções.
  await expect(
    page.getByRole('heading', { name: 'Antes do truque, o 2FA' })
  ).toBeVisible()
})

test.describe('sessão de torcedor', () => {
  test.use({ storageState: storageState('fan') })

  test('não abre o Houdini pelo endereço', async ({ page }) => {
    const response = await page.goto('/houdini')
    expect(response?.status()).toBe(404)
  })
})
