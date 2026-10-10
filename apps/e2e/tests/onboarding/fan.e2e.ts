import type { Page } from '@playwright/test'
import { BASE_URL } from '../../env'
import { signIn } from '../../fixtures/auth'
import { query } from '../../fixtures/db'
import { expect, test } from '../../fixtures/test'
import { createUser } from '../../fixtures/users'

// WEB-177: onboarding do torcedor (`routes/(onboarding)/onboarding.fan.tsx`).
// Cada teste cria o próprio usuário: concluir o onboarding muda a conta.

const progress = (page: Page) => page.getByText(/^Passo \d de 5$/)
const button = (page: Page, name: string | RegExp) =>
  page.getByRole('button', { name, exact: typeof name === 'string' })
const back = (page: Page) => button(page, 'Voltar')
const radius = (page: Page, km: number) =>
  page.getByRole('button', { name: new RegExp(`^${km} km`) })
const city = (page: Page) => page.getByRole('combobox', { name: 'Sua cidade' })

async function startOnboarding(page: Page) {
  const fan = await createUser({ onboardingCompleted: false })
  await signIn(page, fan)
  // Guarda: onboarding pendente força a rota, mesmo pedindo o dashboard.
  await page.goto('/dashboard')
  await expect(page).toHaveURL(/\/onboarding\/fan$/)
  return fan
}

async function firstTeamOf(sportName: string) {
  const [team] = await query<{ id: string; name: string }>(
    `SELECT t.id, t.name FROM team t JOIN sport s ON s.id = t.sport_id
     WHERE s.name = $1 ORDER BY t.name LIMIT 1`,
    [sportName]
  )
  if (!team) throw new Error(`sem time semeado para ${sportName}`)
  return team
}

test('percorre os passos, pula os times e cai no dashboard com as preferências', async ({
  page
}) => {
  const fan = await startOnboarding(page)
  // Cookie cache da sessão posto à mão (a suíte roda sem ele), e o pedido do
  // cliente para expirá-lo falhando: quem expira é a resposta do cadastro.
  await page
    .context()
    .addCookies([
      { name: 'better-auth.session_data', value: 'antigo', url: BASE_URL }
    ])
  await page.route('**/api/auth/expire-session-cache', (route) => route.abort())

  // Boas-vindas
  await expect(progress(page)).toHaveText('Passo 1 de 5')
  await expect(back(page)).toBeDisabled()
  await button(page, 'Começar').click()

  // Esportes: pelo menos um
  await expect(
    page.getByRole('heading', { name: 'Quais esportes você curte?' })
  ).toBeVisible()
  await expect(button(page, 'Continuar')).toBeDisabled()
  await button(page, 'Futebol').click()
  await expect(button(page, 'Futebol')).toHaveAttribute('aria-pressed', 'true')
  await expect(button(page, 'Continuar')).toBeEnabled()
  await button(page, 'Basquete').click()
  await expect(page.getByText(/^2 selecionados/)).toBeVisible()
  await button(page, 'Continuar').click()

  // Times: opcional, o botão vira "Pular"
  await expect(
    page.getByRole('heading', { name: 'Quem você acompanha?' })
  ).toBeVisible()
  await expect(page.getByRole('group', { name: 'Basquete' })).toBeVisible()
  await button(page, 'Pular').click()

  // Raio: 3 km é o padrão, as quatro opções aparecem
  await expect(
    page.getByRole('heading', { name: 'Quão longe você topa ir?' })
  ).toBeVisible()
  for (const km of [1, 3, 5, 10]) await expect(radius(page, km)).toBeVisible()
  await expect(radius(page, 3)).toHaveAttribute('aria-pressed', 'true')
  await radius(page, 10).click()
  await expect(radius(page, 10)).toHaveAttribute('aria-pressed', 'true')
  await expect(radius(page, 3)).toHaveAttribute('aria-pressed', 'false')

  // Cidade (WEB-319), no mesmo passo: a busca ignora acento, e texto
  // digitado sem escolher na lista não deixa seguir.
  await city(page).fill('sao jose dos camp')
  await expect(button(page, 'Continuar')).toBeDisabled()
  await page.getByRole('option', { name: /^São José dos Campos\s*SP$/ }).click()
  await expect(city(page)).toHaveValue('São José dos Campos, SP')
  await button(page, 'Continuar').click()

  // Revisão
  await expect(
    page.getByRole('heading', { name: 'Pronto para salvar' })
  ).toBeVisible()
  await expect(progress(page)).toHaveText('Passo 5 de 5')
  for (const badge of [
    'Futebol',
    'Basquete',
    '10 km',
    'São José dos Campos, SP'
  ]) {
    await expect(page.getByText(badge, { exact: true })).toBeVisible()
  }

  // A busca do dashboard já sai com o raio escolhido.
  const search = page.waitForRequest(
    (r) =>
      r.url().includes('pubs.search') &&
      decodeURIComponent(r.url()).includes('"radiusKm":10')
  )
  await button(page, /Salvar e encontrar bares/).click()
  await expect(page).toHaveURL(/\/dashboard$/)
  await search
  expect(
    (await page.context().cookies()).map((cookie) => cookie.name)
  ).not.toContain('better-auth.session_data')

  const [user] = await query(
    `SELECT onboarding_completed, search_radius_km, search_city_name, search_city_uf,
            search_city_lat IS NOT NULL AND search_city_lng IS NOT NULL AS has_center
     FROM "user" WHERE id = $1`,
    [fan.id]
  )
  expect(user).toEqual({
    onboarding_completed: true,
    search_radius_km: 10,
    search_city_name: 'São José dos Campos',
    search_city_uf: 'SP',
    has_center: true
  })
  const sports = await query<{ name: string }>(
    `SELECT s.name FROM user_preference_sports p JOIN sport s ON s.id = p.sport_id
     WHERE p.user_id = $1 ORDER BY s.name`,
    [fan.id]
  )
  expect(sports.map((s) => s.name)).toEqual(['Basquete', 'Futebol'])
  expect(
    await query('SELECT 1 FROM user_favorite_teams WHERE user_id = $1', [
      fan.id
    ])
  ).toHaveLength(0)

  // Concluído, o onboarding não abre mais.
  await page.goto('/onboarding/fan')
  await expect(page).toHaveURL(/\/dashboard$/)
})

test('voltar entre passos preserva esportes, times e raio', async ({
  page
}) => {
  const fan = await startOnboarding(page)
  const team = await firstTeamOf('Futebol')

  await button(page, 'Começar').click()
  await button(page, 'Futebol').click()
  await button(page, 'Vôlei').click()
  await button(page, 'Continuar').click()

  const teamButton = page
    .getByRole('group', { name: 'Futebol', exact: true })
    .getByRole('button', { name: team.name, exact: true })
  await teamButton.click()
  await expect(teamButton).toHaveAttribute('aria-pressed', 'true')
  // Com time marcado o botão deixa de oferecer "Pular".
  await expect(button(page, 'Pular')).toHaveCount(0)
  await button(page, 'Continuar').click()

  await radius(page, 5).click()

  // Volta até as boas-vindas: tudo continua marcado no caminho.
  await back(page).click()
  await expect(teamButton).toHaveAttribute('aria-pressed', 'true')
  await back(page).click()
  await expect(button(page, 'Futebol')).toHaveAttribute('aria-pressed', 'true')
  await expect(button(page, 'Vôlei')).toHaveAttribute('aria-pressed', 'true')
  await expect(button(page, 'Basquete')).toHaveAttribute(
    'aria-pressed',
    'false'
  )
  await back(page).click()
  await expect(progress(page)).toHaveText('Passo 1 de 5')

  // E avança de novo sem refazer nada.
  await button(page, 'Começar').click()
  await button(page, 'Continuar').click()
  await expect(teamButton).toHaveAttribute('aria-pressed', 'true')
  await button(page, 'Continuar').click()
  await expect(radius(page, 5)).toHaveAttribute('aria-pressed', 'true')
  await button(page, 'Continuar').click()
  for (const badge of ['Futebol', 'Vôlei', team.name, '5 km']) {
    await expect(page.getByText(badge, { exact: true })).toBeVisible()
  }

  await button(page, /Salvar e encontrar bares/).click()
  await expect(page).toHaveURL(/\/dashboard$/)
  // Este torcedor seguiu sem cidade: ela é opcional.
  const [user] = await query(
    'SELECT search_radius_km, search_city_name FROM "user" WHERE id = $1',
    [fan.id]
  )
  expect(user).toEqual({ search_radius_km: 5, search_city_name: null })
  const teams = await query<{ team_id: string }>(
    'SELECT team_id FROM user_favorite_teams WHERE user_id = $1',
    [fan.id]
  )
  expect(teams.map((t) => t.team_id)).toEqual([team.id])
})
