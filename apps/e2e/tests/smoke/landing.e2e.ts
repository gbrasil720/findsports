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

type TodayGame = { title: string; startsAt: string; bars: number }

/**
 * Responde `pubs.todayGames` com `games`. O banco do E2E é do shard inteiro e
 * outro teste pode ter publicado jogo hoje: sem o dublê, o ramo do hero que
 * sai depende da ordem dos testes. A consulta pode vir no lote com outras;
 * só a posição dela é trocada.
 */
async function stubTodayGames(page: Page, games: TodayGame[]) {
  await page.route(/\/api\/trpc\/[^?]*pubs\.todayGames/, async (route) => {
    const url = new URL(route.request().url())
    const paths = url.pathname.replace('/api/trpc/', '').split(',')
    const response = await route.fetch()
    const body = await response.json()
    const at = paths.indexOf('pubs.todayGames')
    if (Array.isArray(body)) body[at] = { result: { data: games } }
    else body.result = { data: games }
    await route.fulfill({ response, json: body })
  })
}

/** Amanhã no relógio de Brasília, como `brasiliaDay(now, 1)`. */
const brasiliaTomorrow = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(
    Date.now() + 86_400_000
  )

/**
 * Abre o exemplo do hero. Com `game`, espera o campo "Jogo" mostrá-lo antes do
 * clique: o resultado guarda o jogo escolhido na hora do envio, e clicar antes
 * de `pubs.todayGames` responder levava o jogo da lista de exemplo (WEB-532).
 */
async function openExample(page: Page, game?: string) {
  await page.goto('/')
  const real = page.locator('.lp3 .paths .path.real a')
  await expect(real).toHaveAttribute('href', '/dashboard')
  await expect(page.locator('#busca')).toContainText('Bares fictícios')
  if (game) await expect(page.locator('#q-jogo')).toHaveValue(game)
  await page
    .locator('#busca')
    .getByRole('button', { name: 'Ver como fica' })
    .click()
  const results = page.locator('.lp3 .results')
  await expect(results).toBeVisible()
  await expect(results).toContainText('Exemplo')
  return page.locator('.lp3 .answer .hp-next')
}

// Com o jogo, a hora dele: começa em 30 min, então ainda não acabou.
const soon = () => new Date(Date.now() + 30 * 60_000).toISOString()

test('sem jogo hoje, o exemplo leva à grade de amanhã', async ({ page }) => {
  await stubTodayGames(page, [])
  const next = await openExample(page)
  await expect(next).toContainText('Hoje ainda não tem jogo publicado')
  const link = next.locator('[data-cta]')
  await expect(link).toHaveAttribute('data-cta', 'results_explore')
  await expect(link).toHaveAttribute(
    'href',
    `/dashboard?dia=${brasiliaTomorrow()}`
  )
})

test('com poucos jogos hoje, o exemplo leva aos jogos de hoje', async ({
  page
}) => {
  await stubTodayGames(page, [
    { title: 'Flamengo × Vasco', startsAt: soon(), bars: 2 }
  ])
  const next = await openExample(page)
  await expect(next).toContainText('Hoje tem 1 jogo na Onside')
  const link = next.locator('[data-cta]')
  await expect(link).toHaveAttribute('data-cta', 'results_explore')
  await expect(link).toHaveAttribute('href', '/dashboard')
})

test('com jogos hoje, o exemplo leva ao jogo escolhido no Explorar', async ({
  page
}) => {
  const startsAt = soon()
  const games = ['Flamengo × Vasco', 'Grêmio × Inter', 'Lakers × Celtics'].map(
    (title, i) => ({ title, startsAt, bars: i + 1 })
  )
  await stubTodayGames(page, games)
  const next = await openExample(page, 'Flamengo × Vasco')
  await expect(next).toContainText('Flamengo × Vasco passa em 1 bar')
  const link = next.locator('[data-cta]')
  await expect(link).toHaveAttribute('data-cta', 'results_game')
  await expect(link).toHaveAttribute(
    'href',
    `/dashboard?jogo=${encodeURIComponent(`${startsAt}|Flamengo × Vasco`)}`
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
    'hero_explore',
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
      'hero_app',
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

  // Abre de novo pelo `goto` da suíte, que só volta com a página hidratada:
  // o `<html>` escuro vem do script do head, o rádio só depois do React.
  // (WEB-516: a falha do celular do CI era do `vite dev`, que compilava e
  // recarregava módulos no meio da visita; a suíte roda no build desde então.)
  await page.goto('/')
  await expect(html).toHaveAttribute('data-theme', 'dark')
  await expect(tema.getByRole('radio', { name: 'Escuro' })).toBeChecked()

  await tema.getByText('Auto').click()
  await expect(html).toHaveAttribute('data-theme', 'dark')
  await page.emulateMedia({ colorScheme: 'light' })
  await expect(html).toHaveAttribute('data-theme', 'light')
})
