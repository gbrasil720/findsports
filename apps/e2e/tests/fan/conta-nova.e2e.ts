import type { Page } from '@playwright/test'
import { query } from '../../fixtures/db'
import { lastEmailTo } from '../../fixtures/email'
import {
  createEvent,
  hours,
  isFavorite,
  north,
  pubAt,
  uniqueSpot
} from '../../fixtures/fan'
import { print } from '../../fixtures/prints'
import { expect, test } from '../../fixtures/test'
import { submitSignup, uniqueEmail, VERIFICATION_SUBJECT } from '../auth/forms'

// Conta nova por uma ação (WEB-501, protótipo `bem-vindo-curto`): quem cria
// conta para marcar presença ou salvar um bar vê a ação concluída primeiro,
// com o card "Conta criada e…", e escolhe esportes, times e raio depois, numa
// tela curta. Sem ação, o cadastro segue pelo onboarding de 5 passos.

const brasiliaDay = (date: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(
    date
  )

const cartao = (page: Page, nome: string) =>
  page
    .locator('article.bc')
    .filter({ has: page.getByRole('heading', { name: nome }) })

const card = (page: Page) => page.locator('section.fresh')

const contaDe = (email: string) =>
  query<{
    id: string
    onboarding_completed: boolean
    search_radius_km: number
    sports: number
  }>(
    `SELECT u.id, u.onboarding_completed, u.search_radius_km,
            (SELECT count(*)::int FROM user_preference_sports p
              WHERE p.user_id = u.id) AS sports
       FROM "user" u WHERE u.email = $1`,
    [email]
  ).then((rows) => rows[0])

/** Bar Elite com um jogo daqui a duas horas; o navegador fica perto dele. */
async function barComJogo(page: Page) {
  const spot = uniqueSpot()
  const pub = await pubAt(north(spot, 0.5))
  const startsAt = hours(2)
  const eventId = await createEvent({
    barId: pub.barId,
    startsAt,
    freeText: `Final ${pub.name}`
  })
  await page.context().setGeolocation(spot)
  return { pub, eventId, dia: brasiliaDay(startsAt) }
}

/** "Criar conta grátis" da folha, o cadastro e o link do e-mail. */
async function criarContaPelaFolha(page: Page, folha: string, email: string) {
  const dialogo = page.getByRole('dialog', { name: folha })
  await expect(dialogo).toBeVisible()
  await dialogo.getByRole('link', { name: 'Criar conta grátis' }).click()
  await expect(page).toHaveURL(/\/signup\?callbackUrl=.*acao/)
  await expect(page.locator('html[data-hydrated]')).toHaveCount(1)
  await submitSignup(page, { name: 'Torcedor Novo', email })
  await expect(page).toHaveURL(/\/verify-email\?callbackUrl=/)
  const { link } = await lastEmailTo(email, { subject: VERIFICATION_SUBJECT })
  await page.goto(link)
}

test('cadastro pelo "Vou assistir aqui": código, card e a tela curta', async ({
  page
}, testInfo) => {
  const { pub, eventId, dia } = await barComJogo(page)
  const email = uniqueEmail('conta-nova-vou')

  await page.goto(`/dashboard?dia=${dia}`)
  await cartao(page, pub.name)
    .getByRole('button', { name: 'Vou assistir aqui' })
    .click()
  await criarContaPelaFolha(page, 'Entre para marcar presença', email)

  // A ação primeiro: o código do balcão, sem passar pelo onboarding.
  await expect(page).toHaveURL(
    new RegExp(`/dashboard/codigo/${eventId}\\?novo=vou$`)
  )
  await expect(page.getByLabel(/^QR do código/)).toBeVisible()
  await expect(card(page)).toContainText('Conta criada e presença marcada')
  await expect(card(page)).toContainText(
    'Seu código está aqui e em Meus jogos.'
  )
  const conta = await contaDe(email)
  expect(conta?.onboarding_completed).toBe(false)
  const [presenca] = await query(
    'SELECT 1 FROM attendance WHERE user_id = $1 AND event_id = $2',
    [conta?.id, eventId]
  )
  expect(presenca).toBeDefined()
  await card(page).scrollIntoViewIfNeeded()
  await print(page, testInfo, 'conta-nova-codigo', 500)

  // As preferências depois, numa página só.
  await card(page).getByRole('link', { name: 'Escolher agora' }).click()
  await expect(page).toHaveURL(/\/dashboard\/bem-vindo\?/)
  await expect(
    page.getByRole('heading', { name: 'Do que você gosta?' })
  ).toBeVisible()
  await expect(page.getByText('Conta criada e presença marcada')).toBeVisible()
  await print(page, testInfo, 'conta-nova-bem-vindo-topo', 500)
  // Sem as abas de baixo: a tela é só a escolha.
  await expect(page.getByRole('navigation', { name: 'Sua conta' })).toHaveCount(
    0
  )
  await page.getByRole('button', { name: 'Futebol', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Futebol', exact: true })
  ).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('slider', { name: 'Raio em km' }).fill('10')
  await expect(page.getByText('10 km', { exact: true })).toBeVisible()
  await page
    .getByRole('button', { name: 'Salvar', exact: true })
    .scrollIntoViewIfNeeded()
  await print(page, testInfo, 'conta-nova-bem-vindo-fim', 500)
  await page.getByRole('button', { name: 'Salvar', exact: true }).click()

  // Volta ao código, sem o card, com o onboarding concluído.
  await expect(page).toHaveURL(new RegExp(`/dashboard/codigo/${eventId}$`))
  await expect(card(page)).toHaveCount(0)
  await expect(
    page.getByText('Pronto. Os seus jogos e bares aparecem primeiro.')
  ).toBeVisible()
  await expect
    .poll(() => contaDe(email))
    .toMatchObject({
      onboarding_completed: true,
      search_radius_km: 10,
      sports: 1
    })
  // A guarda não manda mais ao onboarding.
  await page.goto('/dashboard/games')
  await expect(page).toHaveURL(/\/dashboard\/games$/)
})

test('cadastro por favoritar na página do bar: Seus bares, card e "Depois"', async ({
  page
}, testInfo) => {
  const { pub } = await barComJogo(page)
  const email = uniqueEmail('conta-nova-fav')

  await page.goto(`/pub/${pub.barId}`)
  await page.getByRole('button', { name: `Salvar o ${pub.name}` }).click()
  await criarContaPelaFolha(page, 'Entre para salvar o bar', email)

  await expect(page).toHaveURL(/\/dashboard\/seus-bares\?aba=salvos&novo=fav$/)
  await expect(card(page)).toContainText('Conta criada e bar salvo')
  const conta = await contaDe(email)
  await expect.poll(() => isFavorite(conta?.id ?? '', pub.barId)).toBe(true)
  await print(page, testInfo, 'conta-nova-seus-bares', 500)

  await card(page).getByRole('button', { name: 'Depois' }).click()
  await expect(card(page)).toHaveCount(0)
  await expect(page).toHaveURL(/\/dashboard\/seus-bares\?aba=salvos$/)
  await expect(
    page.getByText('Tudo bem. Esportes, times e raio ficam em Preferências.')
  ).toBeVisible()
  // "Depois" conclui só o mínimo: o raio padrão e nenhum esporte.
  await expect
    .poll(() => contaDe(email))
    .toMatchObject({
      onboarding_completed: true,
      search_radius_km: 3,
      sports: 0
    })
  await page.goto('/dashboard/games')
  await expect(page).toHaveURL(/\/dashboard\/games$/)
})

test('cadastro sem ação segue pelo onboarding de 5 passos', async ({
  page
}) => {
  const email = uniqueEmail('conta-nova-sem-acao')

  await page.goto('/signup')
  await submitSignup(page, { name: 'Torcedor Sem Ação', email })
  await expect(page).toHaveURL(/\/verify-email$/)
  const { link } = await lastEmailTo(email, { subject: VERIFICATION_SUBJECT })
  await page.goto(link)

  await expect(page).toHaveURL(/\/onboarding\/fan$/)
  await expect(page.getByText('1 de 5 · Boas-vindas')).toBeVisible()
})
