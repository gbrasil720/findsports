import { randomUUID } from 'node:crypto'
import { BASE_URL } from '../../env'
import { query } from '../../fixtures/db'
import {
  createEvent,
  days,
  pubAt,
  signInFanAt,
  trpc,
  uniqueSpot
} from '../../fixtures/fan'
import { expect, test } from '../../fixtures/test'

// `/dashboard/reservations` (WEB-178): os quatro estados de um pedido e o
// cancelamento do pendente. Os pedidos saem pela API do torcedor e a
// resposta pela do dono, os mesmos procedimentos que as telas chamam.

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

  const owner = await playwright.request.newContext({
    baseURL: BASE_URL,
    extraHTTPHeaders: { 'x-forwarded-for': `10.178.${Date.now() % 250}.1` }
  })
  const login = await owner.post('/api/auth/sign-in/email', {
    data: { email: pub.user.email, password: pub.user.password },
    headers: { origin: BASE_URL }
  })
  expect(login.ok()).toBe(true)
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
})
