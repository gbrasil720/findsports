import { storageState } from '../../fixtures/auth'
import { expect, test } from '../../fixtures/test'

// Guarda e hall dos painéis internos (WEB-181). Só lê: usa as sessões prontas.

const INTERNAL_ROUTES = [
  '/internal',
  '/internal/waitlist',
  '/internal/manage-users',
  '/internal/flags',
  '/internal/attendance'
]

test('visitante é mandado para o /login em toda rota interna', async ({
  page
}) => {
  for (const route of INTERNAL_ROUTES) {
    await page.goto(route)
    await expect(page, route).toHaveURL(/\/login$/)
  }
})

// A guarda manda para `/`, e a home leva cada papel à casa dele.
const HOMES = { fan: /\/dashboard$/, pub: /\/admin$/ } as const

for (const role of ['fan', 'pub'] as const) {
  test.describe(`sessão de ${role}`, () => {
    test.use({ storageState: storageState(role) })

    test('não entra em rota interna: cai na própria casa', async ({ page }) => {
      for (const route of INTERNAL_ROUTES) {
        await page.goto(route)
        await expect(page, route).toHaveURL(HOMES[role])
      }
    })
  })
}

test.describe('admin', () => {
  test.use({ storageState: storageState('admin') })

  test('hall leva a cada painel', async ({ page }) => {
    const panels = [
      ['Lista de Espera', '/internal/waitlist'],
      ['Gerenciar Usuários', '/internal/manage-users'],
      ['Configuração', '/internal/flags'],
      ['Comparecimento', '/internal/attendance']
    ] as const

    for (const [name, url] of panels) {
      await page.goto('/internal')
      await page.getByRole('link', { name }).click()
      await expect(page).toHaveURL(new RegExp(`${url}$`))
      // Volta pelo botão do shell, e não pelo histórico.
      await page.getByRole('link', { name: 'Hall' }).click()
      await expect(page).toHaveURL(/\/internal$/)
    }
  })
})
