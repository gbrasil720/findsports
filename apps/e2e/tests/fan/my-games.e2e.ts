import { randomUUID } from 'node:crypto'
import type {
  APIRequestContext,
  Page,
  PlaywrightWorkerArgs
} from '@playwright/test'
import { BASE_URL } from '../../env'
import { signIn, storageState } from '../../fixtures/auth'
import { query } from '../../fixtures/db'
import {
  createEvent,
  days,
  hours,
  pubAt,
  signInFanAt,
  trpc,
  uniqueSpot
} from '../../fixtures/fan'
import { answerCookieConsent, expect, test } from '../../fixtures/test'

// "Vou assistir aqui" e `/dashboard/games` (Meus jogos), desde que a reserva
// de mesa saiu do produto (16/10/2026): no bar Elite quem marca recebe na hora
// o código do balcão; fora do Elite, só a presença.

/** "A7K·29", como a tela mostra (`formatCode`). */
const shown = (code: string) => `${code.slice(0, 3)}·${code.slice(3)}`

/** Código ativo do torcedor no jogo, como `attendance-ticket.ts` grava. */
async function ticketOf(userId: string, eventId: string) {
  const [row] = await query<{
    status: string
    party_size: number
    code: string
    max_uses: number
    retired: boolean
  }>(
    `SELECT r.status, r.party_size, c.code, c.max_uses,
            c.retired_at IS NOT NULL AS retired
       FROM reservation r JOIN reservation_code c ON c.reservation_id = r.id
      WHERE r.user_id = $1 AND r.event_id = $2`,
    [userId, eventId]
  )
  return row
}

const attendanceOf = async (userId: string, eventId: string) =>
  (
    await query(
      'SELECT 1 FROM attendance WHERE user_id = $1 AND event_id = $2',
      [userId, eventId]
    )
  ).length

/** Abre Meus jogos pelo menu da conta, como o torcedor chega lá. */
async function openMyGames(page: Page) {
  await page.getByRole('button', { name: /^Menu da conta de / }).click()
  await page.getByRole('menuitem', { name: 'Meus jogos' }).click()
  await expect(page).toHaveURL(/\/dashboard\/games$/)
  await expect(
    page.getByRole('heading', { level: 1, name: 'Meus jogos' })
  ).toBeVisible()
}

/** Sessão do dono do bar, para validar pela API. */
async function ownerApi(
  playwright: PlaywrightWorkerArgs['playwright'],
  user: { email: string; password: string }
): Promise<APIRequestContext> {
  const owner = await playwright.request.newContext({
    baseURL: BASE_URL,
    extraHTTPHeaders: { 'x-forwarded-for': `10.178.${Date.now() % 250}.1` }
  })
  const login = await owner.post('/api/auth/sign-in/email', {
    data: { email: user.email, password: user.password },
    headers: { origin: BASE_URL }
  })
  expect(login.ok()).toBe(true)
  return owner
}

test('bar Elite: marcar dá o código na hora, Meus jogos o mostra e desmarcar o aposenta', async ({
  page
}) => {
  const spot = uniqueSpot()
  const pub = await pubAt(spot, {
    bar: { house_offer: 'Chopp em dobro no intervalo' }
  })
  const freeText = `Código ${randomUUID().slice(0, 6)}`
  const eventId = await createEvent({
    barId: pub.barId,
    startsAt: days(2),
    freeText
  })
  const fan = await signInFanAt(page, spot)

  await page.goto(`/pub/${pub.barId}`)
  const game = page.getByRole('group', { name: freeText })
  await game.getByRole('button', { name: 'Vou assistir aqui' }).click()
  await expect(
    game.getByText('Você vai assistir aqui', { exact: true })
  ).toBeVisible()
  await expect(game).toContainText('Seu código:')

  await expect
    .poll(() => ticketOf(fan.id, eventId))
    .toMatchObject({
      status: 'confirmed',
      party_size: 1,
      max_uses: 1,
      retired: false
    })
  const ticket = await ticketOf(fan.id, eventId)
  if (!ticket) throw new Error('código não emitido')
  await expect(game).toContainText(shown(ticket.code))

  await openMyGames(page)
  const card = page.getByRole('article', { name: pub.name })
  await expect(card).toContainText('Você vai')
  await expect(card).toContainText(shown(ticket.code))
  await expect(card).toContainText('Chopp em dobro no intervalo')

  await card.getByRole('button', { name: 'Desmarcar' }).click()
  await expect(card).toHaveCount(0)
  await expect(
    page.getByText('Você ainda não marcou nenhum jogo.')
  ).toBeVisible()
  expect(await ticketOf(fan.id, eventId)).toMatchObject({
    status: 'cancelled',
    retired: true
  })
  expect(await attendanceOf(fan.id, eventId)).toBe(0)
})

test('fora do Elite, marcar não dá código', async ({ page }) => {
  const spot = uniqueSpot()
  const pub = await pubAt(spot, {
    subscription: { plan: 'pro' },
    bar: { house_offer: 'Oferta guardada' }
  })
  const freeText = `Sem código ${randomUUID().slice(0, 6)}`
  const eventId = await createEvent({
    barId: pub.barId,
    startsAt: days(2),
    freeText
  })
  const fan = await signInFanAt(page, spot)

  await page.goto(`/pub/${pub.barId}`)
  const game = page.getByRole('group', { name: freeText })
  await game.getByRole('button', { name: 'Vou assistir aqui' }).click()
  await expect(
    game.getByText('Você vai assistir aqui', { exact: true })
  ).toBeVisible()
  await expect(game).not.toContainText('Seu código')
  await expect.poll(() => attendanceOf(fan.id, eventId)).toBe(1)
  expect(
    await query('SELECT 1 FROM reservation WHERE user_id = $1', [fan.id])
  ).toEqual([])

  await openMyGames(page)
  const card = page.getByRole('article', { name: pub.name })
  await expect(card).toContainText('Você vai')
  await expect(card).not.toContainText('Código')
  await expect(card).not.toContainText('Oferta guardada')
})

// WEB-259: código validado no balcão trava o desmarcar.
test('código validado aparece em Meus jogos e não deixa desmarcar', async ({
  page,
  playwright
}) => {
  const spot = uniqueSpot()
  const pub = await pubAt(spot)
  const freeText = `Validado ${randomUUID().slice(0, 6)}`
  const fan = await signInFanAt(page, spot)
  // Daqui a 1h: a janela de validação já abriu e o jogo ainda não começou.
  const eventId = await createEvent({
    barId: pub.barId,
    startsAt: hours(1),
    freeText
  })
  await trpc(page.request, 'attendance.set', { eventId, attending: true })
  const ticket = await ticketOf(fan.id, eventId)
  if (!ticket) throw new Error('código não emitido')

  const owner = await ownerApi(playwright, pub.user)
  const found = await trpc<{ codeId: string }>(
    owner,
    'reservationValidation.lookup',
    { code: ticket.code }
  )
  await trpc(owner, 'reservationValidation.registerArrival', {
    codeId: found.codeId,
    requestId: randomUUID()
  })
  await owner.dispose()

  await page.goto('/dashboard/games')
  const card = page.getByRole('article', { name: pub.name })
  await expect(card).toContainText('Validado')
  await expect(card).toContainText(shown(ticket.code))
  await expect(card.getByRole('button', { name: 'Desmarcar' })).toHaveCount(0)

  await page.goto(`/pub/${pub.barId}`)
  const game = page.getByRole('group', { name: freeText })
  await expect(game).toContainText('validado no balcão')
  await expect(game.getByRole('button')).toHaveCount(0)

  // O servidor recusa mesmo sem o botão.
  const refused = await page.request.post('/api/trpc/attendance.set', {
    data: { eventId, attending: false },
    headers: { origin: BASE_URL }
  })
  expect(refused.status()).toBe(409)
  expect(await ticketOf(fan.id, eventId)).toMatchObject({
    status: 'confirmed',
    retired: false
  })
  expect(await attendanceOf(fan.id, eventId)).toBe(1)
})

// WEB-360: bar fora do ar (teste vencido ou assinatura encerrada). O código
// continua valendo, e só quem marcou jogo lá lê que o bar saiu da Onside.
test('bar fora do ar: quem marcou lê que ele saiu e que o código vale; os outros, "Bar não encontrado."', async ({
  page,
  browser
}) => {
  const OFF_AIR =
    'Este bar não está mais na Onside. Seu código continua valendo: mostre no balcão.'
  const spot = uniqueSpot()
  const pub = await pubAt(spot)
  const freeText = `Fora do ar ${randomUUID().slice(0, 6)}`
  const fan = await signInFanAt(page, spot)
  const eventId = await createEvent({
    barId: pub.barId,
    startsAt: hours(1),
    freeText
  })
  await trpc(page.request, 'attendance.set', { eventId, attending: true })
  const ticket = await ticketOf(fan.id, eventId)
  if (!ticket) throw new Error('código não emitido')

  // No ar, o nome do bar leva ao perfil.
  await page.goto('/dashboard/games')
  const card = page.getByRole('article', { name: pub.name })
  await expect(card.getByRole('link', { name: pub.name })).toBeVisible()
  await expect(card).not.toContainText('não está mais na Onside')

  // Teste vencido, como a reconciliação diária o deixa (WEB-357).
  await query(
    `UPDATE subscription SET status = 'trialing', current_period_end = $2
      WHERE bar_id = $1`,
    [pub.barId, days(-1)]
  )
  await query('UPDATE bar SET is_active = false WHERE id = $1', [pub.barId])

  await page.goto('/dashboard/games')
  await expect(card).toContainText(shown(ticket.code))
  await expect(card).toContainText(OFF_AIR)
  await expect(card.getByRole('link')).toHaveCount(0)

  // Link antigo para o perfil: a mesma explicação, sem voltar ao painel.
  await page.goto(`/pub/${pub.barId}`)
  await expect(
    page.getByRole('heading', { level: 1, name: pub.name })
  ).toBeVisible()
  await expect(page.getByText(OFF_AIR)).toBeVisible()
  await expect(page.getByText('Bar não encontrado.')).toHaveCount(0)
  await expect(page).toHaveURL(new RegExp(`/pub/${pub.barId}$`))
  await page.getByRole('link', { name: 'Ver meus jogos' }).click()
  await expect(page).toHaveURL(/\/dashboard\/games$/)

  // Torcedor que não marcou nada lá: igual a bar que não existe.
  const stranger = await browser.newContext({
    baseURL: BASE_URL,
    storageState: storageState('fan')
  })
  await answerCookieConsent(stranger)
  const strangerPage = await stranger.newPage()
  await strangerPage.goto(`/pub/${pub.barId}`)
  await expect(strangerPage.getByText('Bar não encontrado.')).toBeVisible()
  await expect(strangerPage).toHaveURL(/\/dashboard$/)
  await expect(strangerPage.getByText(pub.name)).toHaveCount(0)
  await stranger.close()

  // Sem sessão: o portão de login, sem nome de bar nem no título.
  const anonymous = await browser.newContext({ baseURL: BASE_URL })
  await answerCookieConsent(anonymous)
  const anonymousPage = await anonymous.newPage()
  await anonymousPage.goto(`/pub/${pub.barId}`)
  await expect(
    anonymousPage.getByRole('dialog', { name: 'Autenticação obrigatória' })
  ).toBeVisible()
  await expect(anonymousPage).toHaveTitle('Bar — Onside')
  await expect(anonymousPage.getByText(pub.name)).toHaveCount(0)
  await anonymous.close()

  // "Continua valendo" é verdade: o dono do bar fora do ar ainda valida.
  await page.context().clearCookies()
  await signIn(page, pub.user)
  await page.goto('/admin')
  await page.getByRole('link', { name: 'Validar código' }).first().click()
  await expect(page).toHaveURL(/\/admin\/validate$/)
  await page.getByLabel('Código', { exact: true }).fill(ticket.code)
  await page.getByRole('button', { name: 'Buscar código' }).click()
  await expect(
    page.getByRole('heading', { level: 3, name: fan.name })
  ).toBeVisible()
})

// Marcar "Vou assistir aqui" libera a avaliação; em Meus jogos o jogo que
// passou ganha "Avaliar", que abre o dashboard com esse jogo na frente.
test('jogo encerrado com avaliação aberta: Avaliar leva ao card daquele jogo', async ({
  page
}) => {
  const spot = uniqueSpot()
  const pub = await pubAt(spot)
  const fan = await signInFanAt(page, spot)
  const tag = randomUUID().slice(0, 6)
  const recent = `Recente ${tag}`
  const older = `Antigo ${tag}`
  const recentId = await createEvent({
    barId: pub.barId,
    startsAt: hours(-5),
    freeText: recent
  })
  const olderId = await createEvent({
    barId: pub.barId,
    startsAt: hours(-30),
    freeText: older
  })
  for (const eventId of [recentId, olderId]) {
    await query('INSERT INTO attendance (user_id, event_id) VALUES ($1, $2)', [
      fan.id,
      eventId
    ])
  }

  await page.goto('/dashboard/games')
  const row = page.getByRole('listitem').filter({ hasText: older })
  await row.getByRole('link', { name: `Avaliar o ${pub.name}` }).click()
  await expect(page).toHaveURL(new RegExp(`/dashboard\\?avaliar=${olderId}`))

  const rating = page.getByRole('region', {
    name: `Voltaria pra ver jogo no ${pub.name}?`
  })
  await expect(rating).toContainText(older)
  await rating.getByRole('button', { name: 'Voltaria', exact: true }).click()
  await expect
    .poll(async () =>
      (
        await query<{ would_return: boolean }>(
          'SELECT would_return FROM bar_rating WHERE actor_user_id = $1 AND event_id = $2',
          [fan.id, olderId]
        )
      ).map((r) => r.would_return)
    )
    .toEqual([true])
})
