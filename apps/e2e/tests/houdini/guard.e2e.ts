import { signIn, storageState } from '../../fixtures/auth'
import { expect, test } from '../../fixtures/test'
import { createUser } from '../../fixtures/users'

// Portão do Houdini (WEB-383; antes, a guarda do /internal, WEB-181). No E2E
// não há subdomínio: o Houdini responde em `/houdini`, como no preview. Quem
// não é admin com 2FA recebe o 404 de verdade, a Cortina.

const HOUDINI_ROUTES = [
  '/houdini',
  '/houdini/pessoas',
  '/houdini/feiticos',
  '/houdini/fantasmas',
  '/houdini/bares',
  '/houdini/grimorio'
]

test.describe('visitante', () => {
  test('recebe 404 em toda rota do Houdini', async ({ page }) => {
    for (const route of HOUDINI_ROUTES) {
      const response = await page.goto(route)
      expect(response?.status(), route).toBe(404)
      await expect(page.getByText('404 · nada por aqui'), route).toBeVisible()
    }
  })

  test('a Entrada abre e leva ao login', async ({ page }) => {
    const response = await page.goto('/houdini/entrar')
    expect(response?.status()).toBe(200)
    await expect(
      page.getByRole('heading', { name: 'Houdini', exact: true })
    ).toBeVisible()
    await page.getByRole('link', { name: 'Entrar com a conta Onside' }).click()
    await expect(page).toHaveURL(/\/login\?callbackUrl=%2Fhoudini$/)
  })
})

for (const role of ['fan', 'pub'] as const) {
  test.describe(`sessão de ${role}`, () => {
    test.use({ storageState: storageState(role) })

    test('recebe 404 em toda rota do Houdini, Entrada inclusive', async ({
      page
    }) => {
      for (const route of [...HOUDINI_ROUTES, '/houdini/entrar']) {
        const response = await page.goto(route)
        expect(response?.status(), route).toBe(404)
        await expect(page.getByText('404 · nada por aqui'), route).toBeVisible()
      }
    })
  })
}

test('admin sem 2FA vê o pedido de 2FA, e não as seções', async ({ page }) => {
  await signIn(page, await createUser({ role: 'admin' }))
  await page.goto('/houdini/pessoas')
  await expect(
    page.getByRole('heading', { name: 'Antes do truque, o 2FA' })
  ).toBeVisible()
  await expect(
    page.getByRole('navigation', { name: 'Seções do Houdini' })
  ).toHaveCount(0)
})

test.describe('admin com 2FA', () => {
  test.use({ storageState: storageState('admin') })

  test('vê o Início, e a Entrada volta para ele', async ({ page }) => {
    await page.goto('/houdini')
    await expect(
      page.getByRole('heading', { level: 1, name: /^Bo[am] / })
    ).toBeVisible()
    await page.goto('/houdini/entrar')
    await expect(page).toHaveURL(/\/houdini$/)
  })

  test('o trilho leva a cada seção', async ({ page }) => {
    const sections = [
      ['Pessoas', '/houdini/pessoas'],
      ['Feitiços', '/houdini/feiticos'],
      ['Fantasmas', '/houdini/fantasmas'],
      ['Bares', '/houdini/bares'],
      ['Grimório', '/houdini/grimorio']
    ] as const
    await page.goto('/houdini')
    const rail = page.getByRole('navigation', { name: 'Seções do Houdini' })

    for (const [name, url] of sections) {
      await rail.getByRole('link', { name, exact: true }).click()
      await expect(page).toHaveURL(new RegExp(`${url}$`))
      await expect(page.getByRole('heading', { level: 1, name })).toBeVisible()
    }
    await rail.getByRole('link', { name: 'Início', exact: true }).click()
    await expect(page).toHaveURL(/\/houdini$/)
  })

  // WEB-393: o painel antigo saiu; o endereço velho é uma URL qualquer.
  test('o /internal antigo não existe mais', async ({ page }) => {
    for (const route of ['/internal', '/internal/flags']) {
      const response = await page.goto(route)
      expect(response?.status(), route).toBe(404)
    }
  })
})
