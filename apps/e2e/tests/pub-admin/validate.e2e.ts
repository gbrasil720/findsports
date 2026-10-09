import { randomUUID } from 'node:crypto'
import type { Page } from '@playwright/test'
import { signIn } from '../../fixtures/auth'
import { query } from '../../fixtures/db'
import { createPub, type Plan } from '../../fixtures/pubs'
import { createEvent, createReservation } from '../../fixtures/reservations'
import { expect, test } from '../../fixtures/test'

// Validação de chegada (WEB-126) em /admin/validate. Cada teste cria o próprio
// bar Elite: o contador e o limite de tentativas são por conta.

/** `ARRIVAL_UNDO_WINDOW_MS` de `packages/db/src/reservation-code.ts`. */
const ARRIVAL_UNDO_WINDOW_MS = 45_000

async function openValidation(plan: Plan = 'elite') {
  const pub = await createPub({ subscription: { plan } })
  const { eventId } = await createEvent(pub.barId)
  return { ...pub, eventId }
}

/** Busca o código. Código completo espera a resposta do servidor. */
async function lookup(page: Page, code: string) {
  await page.getByLabel('Código', { exact: true }).fill(code)
  const answered =
    code.replace(/[^a-z0-9]/gi, '').length === 6
      ? page.waitForResponse(/reservationValidation\.lookup/)
      : null
  await page.getByRole('button', { name: 'Buscar reserva' }).click()
  await answered
}

test('Starter e Pro veem a validação bloqueada, com caminho para os planos', async ({
  page
}) => {
  for (const plan of ['starter', 'pro'] as const) {
    const { user } = await openValidation(plan)
    await page.context().clearCookies()
    await signIn(page, user)
    await page.goto('/admin/validate')
    await expect(page.getByText('Disponível no plano Elite')).toBeVisible()
    await expect(
      page.getByRole('link', { name: 'Ver planos' })
    ).toHaveAttribute('href', /\/plan\?origin=admin/)
    await expect(page.getByLabel('Código', { exact: true })).toHaveCount(0)
  }
})

test('Starter recebe FORBIDDEN ao chamar a validação direto', async ({
  page
}) => {
  const { user } = await openValidation('starter')
  await signIn(page, user)
  const response = await page.request.post(
    '/api/trpc/reservationValidation.lookup',
    { data: { code: 'ABC123' } }
  )
  expect(response.status()).toBe(403)
})

test('Elite registra chegada com confirmação, desfaz e completa a reserva', async ({
  page
}) => {
  const { user, eventId } = await openValidation()
  const reservation = await createReservation(eventId, {
    partySize: 2,
    offerSnapshot: 'Chope em dobro'
  })
  await signIn(page, user)
  await page.goto('/admin/validate')

  // Minúscula vale: o campo normaliza para a forma gravada.
  await lookup(page, reservation.code.toLowerCase())
  await expect(
    page.getByRole('heading', { name: `Reserva de ${reservation.guestName}` })
  ).toBeVisible()
  await expect(page.getByText('Chope em dobro')).toBeVisible()
  await expect(
    page.getByText('0 de 2 validados', { exact: true })
  ).toBeVisible()

  // +1 pede confirmação; cancelar não grava.
  await page.getByRole('button', { name: 'Registrar chegada (+1)' }).click()
  const dialog = page.getByRole('dialog', { name: 'Registrar chegada?' })
  await expect(dialog).toContainText('1 de 2 validados')
  await dialog.getByRole('button', { name: 'Cancelar' }).click()
  await expect(dialog).toBeHidden()
  await expect(
    page.getByText('0 de 2 validados', { exact: true })
  ).toBeVisible()

  await page.getByRole('button', { name: 'Registrar chegada (+1)' }).click()
  await dialog.getByRole('button', { name: 'Confirmar chegada' }).click()
  await expect(
    page.getByText('Chegada registrada. 1 de 2 validados.')
  ).toBeVisible()

  await page.getByRole('button', { name: 'Desfazer a última chegada' }).click()
  await expect(
    page.getByText('Chegada desfeita. 0 de 2 validados.')
  ).toBeVisible()

  for (const counter of ['1 de 2 validados', '2 de 2 validados']) {
    await page.getByRole('button', { name: 'Registrar chegada (+1)' }).click()
    await dialog.getByRole('button', { name: 'Confirmar chegada' }).click()
    await expect(
      page.getByText(`Chegada registrada. ${counter}.`)
    ).toBeVisible()
  }
  await expect(
    page.getByText('Reserva completa', { exact: true })
  ).toBeVisible()
  await expect(
    page.getByText('As 2 pessoas desta reserva já foram validadas.')
  ).toBeVisible()
  // Completa, o `+1` sai da tela e o desfazer curto continua (WEB-299).
  await expect(
    page.getByRole('button', { name: 'Registrar chegada (+1)' })
  ).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Desfazer a última chegada' })
  ).toBeVisible()

  const [code] = await query<{ used_count: number }>(
    'SELECT used_count FROM reservation_code WHERE reservation_id = $1',
    [reservation.reservationId]
  )
  expect(code?.used_count).toBe(2)

  await page.getByRole('button', { name: 'Validar outro código' }).click()
  await expect(page.getByLabel('Código', { exact: true })).toBeFocused()
})

test('código incompleto, inexistente e de outro bar', async ({ page }) => {
  const { user } = await openValidation()
  const other = await openValidation()
  const othersReservation = await createReservation(other.eventId)
  await signIn(page, user)
  await page.goto('/admin/validate')

  await lookup(page, 'AB1')
  await expect(
    page
      .getByRole('alert')
      .filter({ hasText: 'O código tem 6 letras e números.' })
  ).toBeVisible()

  const notFound =
    'Código não encontrado, recusado ou cancelado. Confira com o torcedor.'
  await lookup(page, 'ZZZZZ9')
  await expect(
    page.getByRole('alert').filter({ hasText: notFound })
  ).toBeVisible()

  // Código de outro bar responde igual a código que não existe.
  await lookup(page, othersReservation.code)
  await expect(
    page.getByRole('alert').filter({ hasText: notFound })
  ).toBeVisible()
})

test('reserva pendente e jogo fora da janela não registram chegada', async ({
  page
}) => {
  const { user, barId, eventId } = await openValidation()
  const pending = await createReservation(eventId, { status: 'pending' })
  const later = await createEvent(barId, {
    startsAt: new Date(Date.now() + 2 * 86_400_000)
  })
  const early = await createReservation(later.eventId)
  await signIn(page, user)
  await page.goto('/admin/validate')

  await lookup(page, pending.code)
  await expect(
    page.getByText('Esta reserva ainda não foi confirmada', { exact: true })
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Registrar chegada (+1)' })
  ).toHaveCount(0)

  await page.getByRole('button', { name: 'Validar outro código' }).click()
  await lookup(page, early.code)
  await expect(
    page.getByText('Este código ainda não abriu', { exact: true })
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Registrar chegada (+1)' })
  ).toHaveCount(0)
})

test('jogo encerrado há mais de 3h: código expirado, e o servidor recusa a chegada', async ({
  page
}) => {
  const { user, barId } = await openValidation()
  // Sem `ends_at`, o fim é início + 3h; a janela fecha 3h depois disso.
  const past = await createEvent(barId, {
    startsAt: new Date(Date.now() - 7 * 3_600_000)
  })
  const expired = await createReservation(past.eventId)
  await signIn(page, user)
  await page.goto('/admin/validate')

  await lookup(page, expired.code)
  await expect(
    page.getByText('Este código expirou', { exact: true })
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Registrar chegada (+1)' })
  ).toHaveCount(0)

  const [code] = await query<{ id: string }>(
    'SELECT id FROM reservation_code WHERE reservation_id = $1',
    [expired.reservationId]
  )
  const response = await page.request.post(
    '/api/trpc/reservationValidation.registerArrival',
    { data: { codeId: code?.id, requestId: randomUUID() } }
  )
  expect(response.status()).toBe(412)
})

test('o botão de desfazer some quando o prazo acaba', async ({ page }) => {
  await page.clock.install()
  const { user, eventId } = await openValidation()
  const reservation = await createReservation(eventId, { partySize: 1 })
  await signIn(page, user)
  await page.goto('/admin/validate')

  await lookup(page, reservation.code)
  await page.getByRole('button', { name: 'Registrar chegada (+1)' }).click()
  await page
    .getByRole('dialog', { name: 'Registrar chegada?' })
    .getByRole('button', { name: 'Confirmar chegada' })
    .click()
  const undo = page.getByRole('button', { name: 'Desfazer a última chegada' })
  await expect(undo).toBeVisible()

  await page.clock.fastForward(ARRIVAL_UNDO_WINDOW_MS + 1_000)
  await expect(undo).toHaveCount(0)
  await expect(page.getByText('1 de 1 validado', { exact: true })).toBeVisible()
})

test('limite de tentativas: depois de 10 códigos errados, nem o certo passa', async ({
  page
}) => {
  const { user, eventId } = await openValidation()
  const reservation = await createReservation(eventId)
  await signIn(page, user)
  for (let i = 0; i < 10; i++) {
    const wrong = await page.request.post(
      '/api/trpc/reservationValidation.lookup',
      { data: { code: `ZZZZ${String(i).padStart(2, '0')}` } }
    )
    // Código que não resolve é resultado, não erro (WEB-316).
    expect(wrong.status()).toBe(200)
  }
  await page.goto('/admin/validate')

  await lookup(page, reservation.code)
  await expect(
    page.getByRole('alert').filter({
      hasText: 'Muitas tentativas seguidas. Aguarde um pouco e tente novamente.'
    })
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { name: `Reserva de ${reservation.guestName}` })
  ).toHaveCount(0)
})
