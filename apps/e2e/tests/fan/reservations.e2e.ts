import { randomUUID } from 'node:crypto'
import type { APIRequestContext, PlaywrightWorkerArgs } from '@playwright/test'
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
import { expect, test } from '../../fixtures/test'

// `/dashboard/reservations` (WEB-178): os quatro estados de um pedido e o
// cancelamento do pendente. Os pedidos saem pela API do torcedor e a
// resposta pela do dono, os mesmos procedimentos que as telas chamam.

const PRESENCE_KEPT = 'Você continua marcado em “Vou assistir aqui” neste jogo.'
const PRESENCE_REMOVED =
  'Você não está mais marcado em “Vou assistir aqui” neste jogo.'

/** Sessão do dono do bar, para responder e validar pela API. */
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

test('lista pendente, confirmada, recusada e cancelada; cancela a pendente', async ({
  page,
  playwright
}) => {
  const spot = uniqueSpot()
  const pub = await pubAt(spot, { bar: { accepts_reservations: true } })
  const games = {
    pending: `Pendente ${randomUUID().slice(0, 6)}`,
    confirmed: `Confirmada ${randomUUID().slice(0, 6)}`,
    declined: `Recusada ${randomUUID().slice(0, 6)}`,
    cancelled: `Cancelada ${randomUUID().slice(0, 6)}`
  }
  await signInFanAt(page, spot)
  const reservationIds: Record<string, string> = {}
  for (const [status, freeText] of Object.entries(games)) {
    const eventId = await createEvent({
      barId: pub.barId,
      startsAt: days(3),
      freeText
    })
    const created = await trpc<{ id: string }>(
      page.request,
      'reservations.create',
      { requestId: randomUUID(), eventId, partySize: 2 }
    )
    reservationIds[status] = created.id
  }

  const owner = await ownerApi(playwright, pub.user)
  for (const status of ['confirmed', 'declined'] as const) {
    await trpc(owner, 'barReservations.respond', {
      reservationId: reservationIds[status],
      status
    })
  }
  await owner.dispose()
  await trpc(page.request, 'reservations.cancel', {
    reservationId: reservationIds.cancelled
  })

  await page.goto('/dashboard/reservations')
  const card = (title: string) => page.getByRole('article', { name: title })
  await expect(card(games.pending)).toContainText('Pendente')
  await expect(card(games.confirmed)).toContainText('Confirmada')
  await expect(card(games.confirmed)).toContainText('Código')
  await expect(card(games.declined)).toContainText('Recusada')
  await expect(card(games.cancelled)).toContainText('Cancelada')
  // WEB-296: cancelar mantém "Vou assistir aqui"; a recusa desfaz a presença
  // que a reserva criou.
  await expect(card(games.cancelled)).toContainText(PRESENCE_KEPT)
  await expect(card(games.declined)).toContainText(PRESENCE_REMOVED)
  for (const done of [games.declined, games.cancelled]) {
    await expect(
      card(done).getByRole('button', { name: 'Cancelar pedido' })
    ).toHaveCount(0)
  }

  const pending = card(games.pending)
  await pending.getByRole('button', { name: 'Cancelar pedido' }).click()
  await pending.getByRole('button', { name: 'Confirmar cancelamento' }).click()
  await expect(pending).toContainText('Você cancelou este pedido.')
  const [row] = await query('SELECT status FROM reservation WHERE id = $1', [
    reservationIds.pending
  ])
  expect(row).toEqual({ status: 'cancelled' })

  // O aviso de que a presença ficou vem com o desfazer.
  await expect(pending).toContainText(PRESENCE_KEPT)
  await pending.getByRole('button', { name: 'Desmarcar' }).click()
  await expect(pending).not.toContainText(PRESENCE_KEPT)
  expect(
    await query(
      `SELECT 1 FROM attendance a
         JOIN reservation r ON r.user_id = a.user_id AND r.event_id = a.event_id
        WHERE r.id = $1`,
      [reservationIds.pending]
    )
  ).toEqual([])
})

// WEB-259: chegada registrada aparece para o torcedor e trava o cancelamento.
test('chegada registrada aparece na reserva e tira o cancelamento', async ({
  page,
  playwright
}) => {
  const spot = uniqueSpot()
  const pub = await pubAt(spot, { bar: { accepts_reservations: true } })
  const freeText = `Chegada ${randomUUID().slice(0, 6)}`
  await signInFanAt(page, spot)
  // Daqui a 1h: a janela de validação já abriu e o jogo ainda não começou.
  const eventId = await createEvent({
    barId: pub.barId,
    startsAt: hours(1),
    freeText
  })
  const created = await trpc<{ id: string; code: string }>(
    page.request,
    'reservations.create',
    { requestId: randomUUID(), eventId, partySize: 2 }
  )

  const owner = await ownerApi(playwright, pub.user)
  await trpc(owner, 'barReservations.respond', {
    reservationId: created.id,
    status: 'confirmed'
  })
  const found = await trpc<{ codeId: string }>(
    owner,
    'reservationValidation.lookup',
    { code: created.code }
  )
  await trpc(owner, 'reservationValidation.registerArrival', {
    codeId: found.codeId,
    requestId: randomUUID()
  })
  await owner.dispose()

  await page.goto('/dashboard/reservations')
  const card = page.getByRole('article', { name: freeText })
  await expect(card).toContainText('Confirmada')
  await expect(card).toContainText('Chegada registrada (1 de 2)')
  await expect(
    card.getByRole('button', { name: 'Cancelar pedido' })
  ).toHaveCount(0)

  // O servidor recusa mesmo sem o botão.
  const refused = await page.request.post('/api/trpc/reservations.cancel', {
    data: { reservationId: created.id },
    headers: { origin: BASE_URL }
  })
  expect(refused.status()).toBe(409)
  const [row] = await query('SELECT status FROM reservation WHERE id = $1', [
    created.id
  ])
  expect(row).toEqual({ status: 'confirmed' })
})

// WEB-318: a resposta do bar chega como toast e selo, sem abrir a lista.
test('recusa do bar vira toast e selo até o torcedor abrir Minhas reservas', async ({
  page,
  playwright
}) => {
  const spot = uniqueSpot()
  const pub = await pubAt(spot, { bar: { accepts_reservations: true } })
  await signInFanAt(page, spot)
  const eventId = await createEvent({
    barId: pub.barId,
    startsAt: days(3),
    freeText: `Aviso ${randomUUID().slice(0, 6)}`
  })
  const created = await trpc<{ id: string }>(
    page.request,
    'reservations.create',
    { requestId: randomUUID(), eventId, partySize: 2 }
  )
  const owner = await ownerApi(playwright, pub.user)
  await trpc(owner, 'barReservations.respond', {
    reservationId: created.id,
    status: 'declined'
  })
  await owner.dispose()

  await page.goto('/dashboard')
  const notice = page
    .locator('[data-sonner-toast]')
    .filter({ hasText: `${pub.name} recusou seu pedido de reserva.` })
  await expect(notice).toContainText(PRESENCE_REMOVED)
  const menu = page.getByRole('button', { name: /^Menu da conta de / })
  await expect(menu).toHaveAccessibleName(/1 reserva com resposta nova/)

  await notice.getByRole('button', { name: 'Ver reservas' }).click()
  await expect(page).toHaveURL(/\/dashboard\/reservations$/)
  await expect(menu).not.toHaveAccessibleName(/resposta nova/)

  // Visto: recarregar o app não avisa de novo.
  const loaded = page.waitForResponse(/reservations\.mine/)
  await page.goto('/dashboard')
  await loaded
  await expect(menu).toBeVisible()
  await expect(menu).not.toHaveAccessibleName(/resposta nova/)
  await expect(notice).toHaveCount(0)
})

// WEB-360: bar fora do ar (teste vencido ou assinatura encerrada). A reserva
// continua valendo, e só quem tem reserva lá lê que o bar saiu da Onside.
test('bar fora do ar: quem tem reserva lê que ele saiu e que a reserva vale; os outros, "Bar não encontrado."', async ({
  page,
  playwright,
  browser
}) => {
  const OFF_AIR =
    'Este bar não está mais na Onside. Sua reserva continua valendo: apresente o código no bar.'
  const spot = uniqueSpot()
  const pub = await pubAt(spot, { bar: { accepts_reservations: true } })
  const freeText = `Fora do ar ${randomUUID().slice(0, 6)}`
  const fan = await signInFanAt(page, spot)
  const eventId = await createEvent({
    barId: pub.barId,
    startsAt: hours(1),
    freeText
  })
  const created = await trpc<{ id: string; code: string }>(
    page.request,
    'reservations.create',
    { requestId: randomUUID(), eventId, partySize: 2 }
  )
  const owner = await ownerApi(playwright, pub.user)
  await trpc(owner, 'barReservations.respond', {
    reservationId: created.id,
    status: 'confirmed'
  })
  await owner.dispose()

  // No ar, o nome do bar leva ao perfil.
  await page.goto('/dashboard/reservations')
  const card = page.getByRole('article', { name: freeText })
  await expect(card.getByRole('link', { name: pub.name })).toBeVisible()
  await expect(card).not.toContainText('não está mais na Onside')

  // Teste vencido, como a reconciliação diária o deixa (WEB-357).
  await query(
    `UPDATE subscription SET status = 'trialing', current_period_end = $2
      WHERE bar_id = $1`,
    [pub.barId, days(-1)]
  )
  await query('UPDATE bar SET is_active = false WHERE id = $1', [pub.barId])

  await page.goto('/dashboard/reservations')
  await expect(card).toContainText('Confirmada')
  await expect(card).toContainText(created.code)
  await expect(card).toContainText(OFF_AIR)
  await expect(card).toContainText(pub.name)
  await expect(card.getByRole('link')).toHaveCount(0)

  // Link antigo para o perfil: a mesma explicação, sem voltar ao painel.
  await page.goto(`/pub/${pub.barId}`)
  await expect(
    page.getByRole('heading', { level: 1, name: pub.name })
  ).toBeVisible()
  await expect(page.getByText(OFF_AIR)).toBeVisible()
  await expect(page.getByText('Bar não encontrado.')).toHaveCount(0)
  await expect(page).toHaveURL(new RegExp(`/pub/${pub.barId}$`))
  await page.getByRole('link', { name: 'Ver minhas reservas' }).click()
  await expect(page).toHaveURL(/\/dashboard\/reservations$/)

  // Torcedor sem reserva lá: igual a bar que não existe.
  const stranger = await browser.newContext({
    baseURL: BASE_URL,
    storageState: storageState('fan')
  })
  const strangerPage = await stranger.newPage()
  await strangerPage.goto(`/pub/${pub.barId}`)
  await expect(strangerPage.getByText('Bar não encontrado.')).toBeVisible()
  await expect(strangerPage).toHaveURL(/\/dashboard$/)
  await expect(strangerPage.getByText(pub.name)).toHaveCount(0)
  await stranger.close()

  // Sem sessão: o portão de login, sem nome de bar nem no título.
  const anonymous = await browser.newContext({ baseURL: BASE_URL })
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
  await page.getByRole('link', { name: 'Validar código' }).click()
  await expect(page).toHaveURL(/\/admin\/validate$/)
  await page.getByLabel('Código', { exact: true }).fill(created.code)
  await page.getByRole('button', { name: 'Buscar reserva' }).click()
  await expect(
    page.getByRole('heading', { name: `Reserva de ${fan.name}` })
  ).toBeVisible()
})
