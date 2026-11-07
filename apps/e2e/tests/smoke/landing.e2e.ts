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
  expect(await hasLed(page)).toBe(4)
  // As provas do problema viram carrossel, cada uma com a sua dor embaixo; a
  // lista do computador fica escondida.
  await expect(page.locator('#lp3-pile .evt').first()).toBeVisible()
  await expect(page.locator('.lp3 .pains')).toBeHidden()
  expect(
    await page.evaluate<number>('document.documentElement.scrollWidth')
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
    'results_explore'
  )
  await expect(results.locator('[data-cta]')).toHaveAttribute(
    'href',
    '/dashboard'
  )
})

test('o CTA do bar leva ao cadastro com "Tenho um bar" marcado', async ({
  page
}) => {
  await page.goto('/')
  const cta = page.locator('[data-cta="footer_pub_signup"]')
  await expect(cta).toHaveText('Cadastre seu bar')
  await expect(cta).toHaveAttribute('href', '/signup?role=pub')

  await cta.click()
  await expect(page).toHaveURL(/\/signup\?role=pub$/)
  await expect(
    page.getByRole('button', { name: 'Tenho um bar' })
  ).toHaveAttribute('aria-pressed', 'true')
  await expect(
    page.getByRole('button', { name: 'Sou torcedor' })
  ).toHaveAttribute('aria-pressed', 'false')
})

// O nome da chamada diz para onde ela leva, e é ele que o `cta_clicked` manda:
// `_explore` para quem vai ver os jogos sem conta (WEB-501), `_app` para quem
// já tem sessão (WEB-278) e `_pub_signup` para o bar.
const ctaNames = (page: Page) =>
  page
    .locator('[data-cta]')
    .evaluateAll((list) => [
      ...new Set(list.map((el) => el.getAttribute('data-cta')))
    ])

test('sem sessão, as chamadas do torcedor levam ao Explorar', async ({
  page
}) => {
  await page.goto('/')
  const nav = page.locator('.lp3 .nav [data-cta="nav_explore"]')
  await expect(nav).toHaveAttribute('href', '/dashboard')
  await expect(nav).toHaveText('Ver jogos de hoje')
  expect((await ctaNames(page)).sort()).toEqual([
    'community_explore',
    'final_explore',
    'final_pub_signup',
    'footer_explore',
    'footer_pub_signup',
    'nav_explore',
    'nav_pub_signup',
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
      'community_app',
      'final_app',
      'final_pub_signup',
      'footer_app',
      'footer_pub_signup',
      'nav_app',
      'nav_pub_signup',
      'pub_pub_signup'
    ])
  })
})

// Troca de tema: sem escolha, o claro (mesmo com o sistema no escuro); a
// escolha do rodapé vale na hora e fica guardada; "Auto" segue o sistema.
test('o tema abre claro e a escolha do rodapé vale e fica guardada', async ({
  page
}) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('/')
  const html = page.locator('html')
  await expect(html).toHaveAttribute('data-theme', 'light')

  const tema = page.locator('footer.foot').getByRole('group', { name: 'Tema' })
  // Confere o rádio antes de recarregar: com o sistema escuro, "Auto" também
  // pinta a página de escuro e mascarava um toque no lugar errado.
  await tema.getByText('Escuro').click()
  await expect(tema.getByRole('radio', { name: 'Escuro' })).toBeChecked()
  await expect(html).toHaveAttribute('data-theme', 'dark')

  // Abre a página de novo por navegação, não por `reload`: no projeto mobile
  // do CI (vite dev) o `reload` abortava os módulos e a página voltava sem
  // hidratar (o `<html>` escuro do script do head, mas nada respondia).
  await page.goto('/', { waitUntil: 'networkidle' })
  await expect(html).toHaveAttribute('data-theme', 'dark')
  await expect(tema.getByRole('radio', { name: 'Escuro' })).toBeChecked({
    timeout: 15_000
  })

  await tema.getByText('Auto').click()
  await expect(html).toHaveAttribute('data-theme', 'dark')
  await page.emulateMedia({ colorScheme: 'light' })
  await expect(html).toHaveAttribute('data-theme', 'light')
})
