import type { Page } from '@playwright/test'
import { storageState } from '../../fixtures/auth'
import { expect, test } from '../../fixtures/test'

// WEB-501: landing v3 ("O Telão do Bar"). O telão de LED é enfeite: carrega a
// grade depois da página e não pode empurrar nada para o lado no celular.

const hasLed = (page: Page) =>
  page.locator('.lp3 canvas[data-led]').evaluateAll((list) => list.length)

test('celular: sem rolagem lateral e com o telão no topo', async ({
  page,
  isMobile
}) => {
  test.skip(!isMobile, 'só no projeto mobile')
  await page.goto('/')
  await expect(page.locator('.lp3 h1')).toBeVisible()
  expect(await hasLed(page)).toBe(3)
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth)
  ).toBeLessThanOrEqual(page.viewportSize()?.width ?? 0)
})

test('a busca de exemplo mostra bares marcados como exemplo e leva ao cadastro', async ({
  page
}) => {
  await page.goto('/')
  await page
    .locator('#busca')
    .getByRole('button', { name: 'Ver bares' })
    .click()
  const results = page.locator('.lp3 .results')
  await expect(results).toBeVisible()
  await expect(results).toContainText('EXEMPLO')
  await expect(results.locator('[data-cta]')).toHaveAttribute(
    'data-cta',
    'results_signup'
  )
  await expect(results.locator('[data-cta]')).toHaveAttribute('href', '/signup')
})

test('o CTA do bar leva ao cadastro com "Dono de Bar" marcado', async ({
  page
}) => {
  await page.goto('/')
  const cta = page.locator('[data-cta="footer_pub_signup"]')
  await expect(cta).toHaveText('Cadastre seu bar')
  await expect(cta).toHaveAttribute('href', '/signup?role=pub')

  await cta.click()
  await expect(page).toHaveURL(/\/signup\?role=pub$/)
  await expect(
    page.getByRole('button', { name: 'Dono de Bar' })
  ).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: 'Torcedor' })).toHaveAttribute(
    'aria-pressed',
    'false'
  )
})

// O nome da chamada diz para onde ela leva, e é ele que o `cta_clicked` manda:
// `_signup` para quem vai criar conta, `_app` para quem já tem sessão (WEB-278).
const ctaNames = (page: Page) =>
  page
    .locator('[data-cta]')
    .evaluateAll((list) => [
      ...new Set(list.map((el) => el.getAttribute('data-cta')))
    ])

test('sem sessão, as chamadas principais se chamam *_signup', async ({
  page
}) => {
  await page.goto('/')
  const nav = page.locator('.lp3 .nav [data-cta="nav_signup"]')
  await expect(nav).toHaveAttribute('href', '/signup')
  await expect(nav).toHaveText('Criar conta grátis')
  expect((await ctaNames(page)).sort()).toEqual([
    'final_pub_signup',
    'final_signup',
    'footer_pub_signup',
    'nav_pub_signup',
    'nav_signup',
    'pub_pub_signup'
  ])
})

test.describe('com sessão', () => {
  test.use({ storageState: storageState('fan') })

  test('as chamadas principais se chamam *_app e levam a /app', async ({
    page
  }) => {
    // `?public=1`: sem ele o guard manda o torcedor logado para o dashboard.
    await page.goto('/?public=1')
    const nav = page.locator('.lp3 .nav [data-cta="nav_app"]')
    await expect(nav).toHaveAttribute('href', '/app')
    await expect(nav).toHaveText('Ver jogos de hoje')
    // As do bar continuam sendo cadastro.
    expect((await ctaNames(page)).sort()).toEqual([
      'final_app',
      'final_pub_signup',
      'footer_pub_signup',
      'nav_app',
      'nav_pub_signup',
      'pub_pub_signup'
    ])
  })
})
