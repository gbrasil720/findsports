import type { Locator, Page } from '@playwright/test'
import { signIn, storageState } from '../../fixtures/auth'
import { query, resetAppConfig } from '../../fixtures/db'
import { expect, test } from '../../fixtures/test'
import { createUser } from '../../fixtures/users'

// Painel /internal/flags (WEB-181). Serial: grava `app_config`, global.

test.use({ storageState: storageState('admin') })
test.afterEach(resetAppConfig)

function card(page: Page, key: string) {
  return page
    .locator('article')
    .filter({ has: page.getByRole('heading', { name: key, exact: true }) })
}

async function storedValue(key: string) {
  const [row] = await query<{ value: unknown }>(
    'SELECT value FROM app_config WHERE key = $1',
    [key]
  )
  return row?.value
}

/**
 * No mobile os toasts empilham no rodapé e cobrem o botão do cartão de baixo;
 * centralizar o alvo antes de clicar tira ele de baixo da pilha.
 */
async function clickCentered(locator: Locator) {
  await locator.evaluate((el) => el.scrollIntoView({ block: 'center' }))
  await locator.click()
}

/** O que um visitante lê das chaves públicas, sem cache no E2E. */
async function publicConfig(page: Page) {
  const response = await page.request.get('/api/trpc/appConfig.getPublic')
  expect(response.ok()).toBe(true)
  return JSON.stringify(await response.json())
}

test('interruptor booleano grava, vale na hora e volta ao padrão', async ({
  page
}) => {
  const key = 'rating.public_display'
  await page.goto('/internal/flags')
  const flag = card(page, key)
  const toggle = flag.getByRole('switch', { name: 'public_display' })

  await expect(flag).toContainText('Padrão')
  await expect(toggle).toHaveAttribute('aria-checked', 'false')

  await toggle.click()
  await expect(page.getByText(`${key} salvo.`)).toBeVisible()
  await expect(toggle).toHaveAttribute('aria-checked', 'true')
  await expect(flag).toContainText('Sobrescrito')
  expect(await storedValue(key)).toBe(true)
  expect(await publicConfig(page)).toContain(`"${key}":true`)

  await flag.getByRole('button', { name: 'Voltar ao padrão' }).click()
  await expect(page.getByText(`${key} voltou ao padrão.`)).toBeVisible()
  await expect(toggle).toHaveAttribute('aria-checked', 'false')
  await expect(flag).toContainText('Padrão')
  expect(await storedValue(key)).toBeUndefined()
})

test('campo booleano de flag em objeto liga sem digitar JSON', async ({
  page
}) => {
  const key = 'launch.waitlist_gate'
  await page.goto('/internal/flags')
  const toggle = card(page, key).getByRole('switch', { name: 'signup' })

  await expect(toggle).toHaveAttribute('aria-checked', 'true')
  await toggle.click()
  await expect(page.getByText(`${key} salvo.`)).toBeVisible()
  await expect(toggle).toHaveAttribute('aria-checked', 'false')
  expect(await storedValue(key)).toEqual({ signup: false })
})

test('JSON inválido e valor fora do formato não gravam', async ({ page }) => {
  const key = 'billing.checkout_enabled'
  await page.goto('/internal/flags')
  const flag = card(page, key)
  await flag.getByText('Editar como JSON').click()
  const field = flag.getByLabel('Valor (JSON)')
  const save = flag.getByRole('button', { name: 'Salvar' })

  await field.fill('verdadeiro')
  await save.click()
  await expect(flag.getByRole('alert')).toHaveText(/JSON inválido/)

  // JSON válido, mas a chave é booleana: quem recusa é o servidor.
  await field.fill('"sim"')
  await save.click()
  await expect(
    page.locator('[data-sonner-toast][data-type="error"]')
  ).toBeVisible()
  await expect(page.getByText(`${key} salvo.`)).toHaveCount(0)
  await expect(flag).toContainText('Padrão')
  expect(await storedValue(key)).toBeUndefined()

  await field.fill('true')
  await save.click()
  await expect(page.getByText(`${key} salvo.`)).toBeVisible()
  expect(await storedValue(key)).toBe(true)
})

test('cidades liberadas: adicionar pela lista e remover', async ({ page }) => {
  const key = 'launch.pub_cities'
  await page.goto('/internal/flags')
  const flag = card(page, key)
  await expect(flag).toContainText('todas liberadas')

  const city = flag.getByRole('combobox', { name: 'Adicionar cidade' })
  await city.click()
  await city.fill('Campinas')
  await flag.getByRole('option', { name: 'Campinas SP', exact: true }).click()
  await expect(page.getByText(`${key} salvo.`)).toBeVisible()
  await expect(
    flag.getByRole('button', { name: 'Remover Campinas' })
  ).toBeVisible()
  // Grava o nome puro, sem a UF que a lista mostra.
  expect(await storedValue(key)).toEqual(['Campinas'])

  await flag.getByRole('button', { name: 'Remover Campinas' }).click()
  await expect(flag).toContainText('todas liberadas')
  await expect.poll(() => storedValue(key)).toEqual([])
})

/**
 * Um valor válido e diferente do atual, do mesmo formato: booleano invertido,
 * primeiro campo booleano do objeto invertido, lista com uma cidade.
 */
function anotherValue(value: unknown): unknown {
  if (typeof value === 'boolean') return !value
  if (Array.isArray(value)) return ['Campinas']
  if (value && typeof value === 'object') {
    const [field] = Object.entries(value).find(
      ([, v]) => typeof v === 'boolean'
    ) ?? ['']
    return { ...value, [field]: !(value as Record<string, unknown>)[field] }
  }
  throw new Error(`Formato sem valor alternativo: ${JSON.stringify(value)}`)
}

test('toda chave edita como JSON, salva e volta ao padrão', async ({
  page
}) => {
  await page.goto('/internal/flags')
  const keys = await page.locator('article h2').allTextContents()
  // As seis chaves de hoje; chave nova entra no laço sozinha.
  expect(keys).toEqual(
    expect.arrayContaining([
      'search.tiered_plan_query',
      'billing.checkout_enabled',
      'waitlist.rate_limit',
      'launch.waitlist_gate',
      'rating.public_display',
      'launch.pub_cities'
    ])
  )

  for (const key of keys) {
    await test.step(key, async () => {
      const flag = card(page, key)
      await clickCentered(flag.getByText('Editar como JSON'))
      const field = flag.getByLabel('Valor (JSON)')
      const next = anotherValue(JSON.parse(await field.inputValue()))

      await field.fill(JSON.stringify(next))
      await clickCentered(flag.getByRole('button', { name: 'Salvar' }))
      await expect(page.getByText(`${key} salvo.`)).toBeVisible()
      await expect(flag).toContainText('Sobrescrito')
      expect(await storedValue(key)).toEqual(next)

      await clickCentered(
        flag.getByRole('button', { name: 'Voltar ao padrão' })
      )
      await expect(page.getByText(`${key} voltou ao padrão.`)).toBeVisible()
      await expect(flag).toContainText('Padrão')
      expect(await storedValue(key)).toBeUndefined()
    })
  }
})

test('ligar rating.public_display mostra a ordem por avaliação na busca', async ({
  page
}) => {
  await page.goto('/internal/flags')
  await card(page, 'rating.public_display')
    .getByRole('switch', { name: 'public_display' })
    .click()
  await expect(page.getByText('rating.public_display salvo.')).toBeVisible()

  // A mesma aba vira torcedor: a busca lê a chave pública na carga seguinte.
  await page.context().clearCookies()
  await signIn(page, await createUser())
  await page.goto('/dashboard')
  await expect(
    page.getByRole('button', { name: 'Melhor avaliados' })
  ).toBeVisible()
})
