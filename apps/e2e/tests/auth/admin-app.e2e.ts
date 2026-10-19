import type { Page } from '@playwright/test'
import { signIn, storageState } from '../../fixtures/auth'
import { createEvent, days, north, pubAt, uniqueSpot } from '../../fixtures/fan'
import { expect, test } from '../../fixtures/test'
import { createUser } from '../../fixtures/users'
import { loginWithForm } from './forms'

// Admin navega pelo app como qualquer conta: landing, busca e o resto. O
// Houdini só abre quando pedido (o item do menu, o `callbackUrl` da Entrada);
// antes o guard mandava todo /dashboard para lá, e com ele o login.

const errorToast = (page: Page) =>
  page.locator('[data-sonner-toast][data-type="error"]')

const openAccountMenu = (page: Page) =>
  page.getByRole('button', { name: /^Menu da conta de / }).click()

test.describe('sessão de admin', () => {
  test.use({ storageState: storageState('admin') })

  test('abre a landing, e "Ir para o app" leva à busca', async ({ page }) => {
    const response = await page.goto('/')
    expect(response?.status()).toBe(200)
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    await page.getByRole('link', { name: 'Ir para o app' }).first().click()
    await expect(page).toHaveURL(/\/dashboard$/)
  })

  test('o menu da conta leva ao Houdini', async ({ page }) => {
    await page.goto('/dashboard')
    await openAccountMenu(page)
    await page.getByRole('menuitem', { name: 'Houdini' }).click()

    await expect(page).toHaveURL(/\/houdini$/)
    await expect(
      page.getByRole('heading', { level: 1, name: /^Bo[am] / })
    ).toBeVisible()
  })
})

test('admin busca bares no /dashboard sem erro de torcedor', async ({
  page
}) => {
  const spot = uniqueSpot()
  const near = await pubAt(north(spot, 0.5))
  await createEvent({ barId: near.barId, startsAt: days(2) })
  await signIn(page, await createUser({ role: 'admin' }))
  await page.context().setGeolocation(spot)

  const response = await page.goto('/dashboard')
  expect(response?.status()).toBe(200)

  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(
    page.getByRole('link', { name: `Ver ${near.name}` })
  ).toBeVisible()
  // Favoritos, times, cidade e avaliações são de torcedor: para admin as
  // leituras nem saem, e nada vira toast.
  await expect(errorToast(page)).toHaveCount(0)
})

test('login de admin pela tela cai na busca', async ({ page }) => {
  await loginWithForm(page, await createUser({ role: 'admin' }))
  await expect(page).toHaveURL(/\/dashboard$/)
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

  test('não vê o Houdini no menu nem no endereço', async ({ page }) => {
    await page.goto('/dashboard')
    await openAccountMenu(page)
    await expect(
      page.getByRole('menuitem', { name: 'Perfil e configurações' })
    ).toBeVisible()
    await expect(page.getByRole('menuitem', { name: 'Houdini' })).toHaveCount(0)

    const response = await page.goto('/houdini')
    expect(response?.status()).toBe(404)
  })
})
