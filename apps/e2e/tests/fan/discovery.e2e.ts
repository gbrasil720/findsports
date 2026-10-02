import type { Page } from '@playwright/test'
import { SAO_PAULO } from '../../env'
import { query } from '../../fixtures/db'
import {
  createEvent,
  days,
  hours,
  north,
  pubAt,
  setPreferences,
  signInFanAt,
  team,
  uniqueSpot
} from '../../fixtures/fan'
import { expect, test } from '../../fixtures/test'

// `/dashboard` (WEB-178). Cada teste põe o torcedor e os bares num ponto
// próprio do mapa: a busca é por raio, então os testes paralelos não se veem.

const card = (page: Page, name: string) =>
  page.getByRole('link', { name: `Ver ${name}` })

const search = (page: Page) =>
  page.getByRole('searchbox', { name: 'Buscar bar, time ou campeonato' })

test('localização concedida busca em volta do torcedor', async ({ page }) => {
  const spot = uniqueSpot()
  const near = await pubAt(north(spot, 0.5))
  await createEvent({ barId: near.barId, startsAt: days(2) })
  await signInFanAt(page, spot)

  await page.goto('/dashboard')

  await expect(card(page, near.name)).toBeVisible()
  await expect(page.getByText('1 bar perto de você')).toBeAttached()
  await expect(
    page.getByRole('button', { name: 'Atualizar localização' })
  ).toBeVisible()
  await expect(page.getByText('Perto de você', { exact: true })).toBeVisible()
})

test.describe('localização negada', () => {
  test.use({ permissions: [] })

  test('cai no centro de São Paulo', async ({ page }) => {
    // Bar no centro de SP com nome único: a busca pelo nome isola ele dos
    // outros bares que a suíte cria ali.
    const central = await pubAt(SAO_PAULO)
    await createEvent({ barId: central.barId, startsAt: days(2) })
    await signInFanAt(page, uniqueSpot())

    await page.goto('/dashboard')
    await page
      .getByRole('button', { name: 'Usar minha localização' })
      .first()
      .click()

    await expect(page.getByText('Localização bloqueada')).toBeVisible()
    await expect(page.getByText('São Paulo, SP', { exact: true })).toBeVisible()
    await search(page).fill(central.name)
    await expect(card(page, central.name)).toBeVisible()
  })
})

test('filtros de texto, esporte, raio, comodidade e time se combinam e saem pelos chips', async ({
  page
}) => {
  const spot = uniqueSpot()
  const arsenal = await team('arsenal')
  const football = await pubAt(north(spot, 0.5), { bar: { amenities: [1] } })
  await createEvent({
    barId: football.barId,
    startsAt: days(2),
    teamIds: [arsenal.id, (await team('argentina')).id]
  })
  const basketball = await pubAt(north(spot, 0.8))
  await createEvent({
    barId: basketball.barId,
    sport: 'basquete',
    championship: 'Liga E2E',
    startsAt: days(2)
  })
  const far = await pubAt(north(spot, 4))
  await createEvent({ barId: far.barId, startsAt: days(2) })
  const fan = await signInFanAt(page, spot)
  await setPreferences(fan.id, { sports: ['futebol'], teams: ['arsenal'] })

  await page.goto('/dashboard')
  await expect(card(page, football.name)).toBeVisible()
  await expect(card(page, basketball.name)).toBeVisible()
  await expect(card(page, far.name)).toHaveCount(0)

  // Raio
  await page.getByRole('button', { name: /^5 km/ }).click()
  await expect(card(page, far.name)).toBeVisible()
  await page.getByRole('button', { name: 'Remover filtro Até 5 km' }).click()
  await expect(card(page, far.name)).toHaveCount(0)

  // Esporte
  await page.getByRole('button', { name: 'Basquete', exact: true }).click()
  await expect(card(page, basketball.name)).toBeVisible()
  await expect(card(page, football.name)).toHaveCount(0)

  // Texto + esporte: o bar de futebol não passa o basquete
  await search(page).fill(football.name)
  await expect(
    page.getByText('Nenhum bar em até 3 km transmitindo o que você busca.')
  ).toBeVisible()
  await page.getByRole('button', { name: 'Remover filtro Basquete' }).click()
  await expect(card(page, football.name)).toBeVisible()
  await expect(card(page, basketball.name)).toHaveCount(0)
  await page
    .getByRole('button', { name: `Remover filtro ${football.name}` })
    .click()
  await expect(card(page, basketball.name)).toBeVisible()

  // Comodidade
  await page.getByRole('button', { name: 'O que o bar tem' }).click()
  await page.getByRole('button', { name: 'Telão / projetor' }).click()
  await expect(card(page, football.name)).toBeVisible()
  await expect(card(page, basketball.name)).toHaveCount(0)
  await page.getByRole('button', { name: 'Limpar filtros' }).click()
  await expect(card(page, basketball.name)).toBeVisible()
  await expect(
    page.getByRole('button', { name: /^Remover filtro/ })
  ).toHaveCount(0)

  // Time que o torcedor acompanha
  await page.getByRole('button', { name: 'Arsenal', exact: true }).click()
  await expect(card(page, football.name)).toBeVisible()
  await expect(card(page, basketball.name)).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Remover filtro Arsenal' })
  ).toBeVisible()
})

test('sem jogo na região e sem filtro, mostra os bares próximos', async ({
  page
}) => {
  const spot = uniqueSpot()
  const quiet = await pubAt(north(spot, 0.5))
  await signInFanAt(page, spot)

  await page.goto('/dashboard')
  await expect(card(page, quiet.name)).toBeVisible()
  await expect(
    page.getByText(
      'Nenhum evento programado na região. Mostrando todos os bares próximos.'
    )
  ).toBeVisible()

  // Com um pedido explícito, "todos os bares por perto" não responde.
  await search(page).fill(quiet.name)
  await expect(card(page, quiet.name)).toHaveCount(0)
  await expect(
    page.getByText('Nenhum bar em até 3 km transmitindo o que você busca.')
  ).toBeVisible()
})

test('"jogos de hoje" deixa só quem tem jogo hoje', async ({ page }) => {
  const spot = uniqueSpot()
  const startsAt = hours(1)
  // O card compara o dia no fuso do navegador (São Paulo). Perto da
  // meia-noite o jogo "de hoje" daqui a uma hora já é amanhã.
  const day = (date: Date) =>
    date.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
  test.skip(
    day(startsAt) !== day(new Date()) || day(hours(4)) !== day(new Date()),
    'perto da meia-noite em São Paulo'
  )
  const today = await pubAt(north(spot, 0.5))
  await createEvent({
    barId: today.barId,
    championship: 'Brasileirão',
    startsAt
  })
  const later = await pubAt(north(spot, 0.8))
  await createEvent({
    barId: later.barId,
    championship: 'Brasileirão',
    startsAt: days(3)
  })
  await signInFanAt(page, spot)

  await page.goto('/dashboard')
  await expect(card(page, later.name)).toBeVisible()
  await page
    .getByRole('button', { name: 'Bares transmitindo Brasileirão hoje' })
    .click()

  await expect(card(page, today.name)).toBeVisible()
  await expect(card(page, later.name)).toHaveCount(0)
  await page.getByRole('button', { name: 'Remover filtro Jogos hoje' }).click()
  await expect(card(page, later.name)).toBeVisible()
})

// O dashboard tem o estado `favoritesOnly` e o chip "Meus favoritos" para
// desfazê-lo, mas nenhum controle liga o filtro: `setFavoritesOnly(true)` não
// é chamado em lugar nenhum. Fica marcado até existir o controle.
test.fixme('"só favoritos" deixa só os bares favoritados', async () => {})

test('favoritar e desfavoritar pela lista', async ({ page }) => {
  const spot = uniqueSpot()
  const pub = await pubAt(north(spot, 0.5))
  await createEvent({ barId: pub.barId, startsAt: days(2) })
  const fan = await signInFanAt(page, spot)
  const favorited = async () =>
    (
      await query(
        'SELECT 1 FROM user_favorite_bars WHERE user_id = $1 AND bar_id = $2',
        [fan.id, pub.barId]
      )
    ).length

  await page.goto('/dashboard')
  await expect(page.getByText('1 bar perto de você')).toBeAttached()
  const row = page.locator('.onside-bar-card', { has: card(page, pub.name) })
  // Hover antes do clique: o `mouseenter` do card re-renderiza o dashboard, e
  // o React 19 regrava o `dangerouslySetInnerHTML` do ícone (reicon) a cada
  // render. Se isso cai entre o mousedown e o mouseup do clique sintético, o
  // `<path>` sob o ponteiro é trocado e o Chrome não dispara o `click`.
  const press = async (name: string) => {
    const button = row.getByRole('button', { name })
    await button.hover()
    await expect(row).toHaveClass(/shadow/)
    await button.click()
  }
  await press('Adicionar aos favoritos')
  await expect(
    row.getByRole('button', { name: 'Remover dos favoritos' })
  ).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(favorited).toBe(1)

  // Volta à tela do zero: o favorito vem do servidor, não do estado local.
  await page.goto('/dashboard')
  await expect(page.getByText('1 bar perto de você')).toBeAttached()
  await press('Remover dos favoritos')
  await expect(
    row.getByRole('button', { name: 'Adicionar aos favoritos' })
  ).toHaveAttribute('aria-pressed', 'false')
  await expect.poll(favorited).toBe(0)
})

test('o mapa marca os bares e o marcador abre a página do bar', async ({
  page
}) => {
  const spot = uniqueSpot()
  const pub = await pubAt(north(spot, 0.5))
  await createEvent({ barId: pub.barId, startsAt: days(2) })
  await signInFanAt(page, spot)

  await page.goto('/dashboard')
  const marker = page
    .locator('.maplibregl-marker')
    .and(page.getByRole('button', { name: pub.name, exact: true }))
  await expect(marker).toBeVisible()
  await marker.click()
  await expect(page).toHaveURL(new RegExp(`/pub/${pub.barId}$`))
})

test('sem VITE_MAP_TILES_URL o mapa mostra o erro e a lista segue', async ({
  page
}) => {
  // O `vite dev` injeta `import.meta.env` no topo de cada módulo. Apagar a
  // URL só na resposta de `env.ts` é o mesmo que subir sem a variável.
  await page.route(/\/src\/lib\/env\.ts(\?|$)/, async (route) => {
    const response = await route.fetch()
    const body = (await response.text()).replace(
      /("VITE_MAP_TILES_URL":\s*)"[^"]*"/,
      '$1""'
    )
    await route.fulfill({ response, body })
  })
  const spot = uniqueSpot()
  const pub = await pubAt(north(spot, 0.5))
  await createEvent({ barId: pub.barId, startsAt: days(2) })
  await signInFanAt(page, spot)

  await page.goto('/dashboard')
  const error = page.getByRole('alert').filter({ hasText: 'Mapa indisponível' })
  await expect(error).toBeVisible()
  // Sem arquivo de tiles não há o que tentar de novo.
  await expect(error.getByRole('button')).toHaveCount(0)
  await expect(card(page, pub.name)).toBeVisible()
})
