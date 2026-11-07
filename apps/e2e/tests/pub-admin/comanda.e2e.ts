import { signIn } from '../../fixtures/auth'
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
import { createEvent as createGame, createTicket } from '../../fixtures/going'
import { createPub } from '../../fixtures/pubs'
import { expect, test } from '../../fixtures/test'

// Código do balcão pela comanda (WEB-412): o bar Elite que confirma "depois
// do jogo" não valida na hora. O garçom anota o código, e o dono lança a
// lista em Quem vai até 48 h depois do fim (`reservationValidation.logLate`),
// com o "Faltou lançar?" dizendo quem marcou e ainda não foi lançado.

/** Código ativo do torcedor no jogo, como `attendance-ticket.ts` grava. */
async function codeOf(userId: string, eventId: string) {
  const [row] = await query<{ code: string }>(
    `SELECT c.code FROM reservation r
       JOIN reservation_code c ON c.reservation_id = r.id
      WHERE r.user_id = $1 AND r.event_id = $2 AND c.retired_at IS NULL`,
    [userId, eventId]
  )
  if (!row) throw new Error('código não emitido')
  return row.code
}

test('torcedor marca, o garçom anota e o dono lança o código depois do jogo', async ({
  page
}) => {
  const spot = uniqueSpot()
  const pub = await pubAt(spot, { bar: { confirms_codes_later: true } })
  const freeText = `Comanda ${pub.barId.slice(0, 6)}`
  const eventId = await createEvent({
    barId: pub.barId,
    startsAt: days(1),
    freeText
  })

  // O torcedor marca e o ingresso fala com o garçom.
  const fan = await signInFanAt(page, spot)
  await trpc(page.request, 'attendance.set', { eventId, attending: true })
  const code = await codeOf(fan.id, eventId)
  await page.goto(`/dashboard/codigo/${eventId}`)
  await expect(
    page.getByText('Mostre ao garçom: ele anota o código na comanda.', {
      exact: false
    })
  ).toBeVisible()

  // O jogo aconteceu: começou há 3 h e o código não passou no balcão.
  await query('UPDATE event SET starts_at = $1 WHERE id = $2', [
    hours(-3),
    eventId
  ])

  await page.context().clearCookies()
  await signIn(page, pub.user)
  await page.goto('/admin/quem-vai')
  const comanda = page.getByRole('region', {
    name: 'Lançar códigos da comanda'
  })
  await expect(comanda).toContainText('Faltou lançar?')
  await expect(comanda).toContainText(freeText)
  await expect(comanda).toContainText(fan.name)

  // Como o dono digita da comanda: minúscula, com o ponto do meio, e um
  // código com a letra errada.
  const typed = `${code.slice(0, 3)}·${code.slice(3)}`.toLowerCase()
  await comanda.getByLabel('Códigos anotados').fill(`${typed}\nZZZZZZ`)
  await comanda.getByRole('button', { name: 'Lançar 2 códigos' }).click()

  const status = comanda.getByRole('status')
  await expect(status).toContainText('1 código lançado · 1 para conferir')
  await expect(status).toContainText('Não encontrado. Confira as letras')
  await expect(status).toContainText(fan.name)
  // Só o que dá para corrigir volta para a caixa.
  await expect(comanda.getByLabel('Códigos anotados')).toHaveValue('ZZZ·ZZZ')
  // Lançado, o torcedor sai do "Faltou lançar?".
  await expect(comanda.getByText('Faltou lançar?')).toHaveCount(0)

  // O uso fica marcado como lançado depois.
  const [use] = await query<{ late: boolean }>(
    `SELECT u.late FROM reservation_code_use u
       JOIN reservation_code c ON c.id = u.code_id
      WHERE c.code = $1 AND u.undone_at IS NULL`,
    [code]
  )
  expect(use?.late).toBe(true)

  // Lançar de novo não conta duas vezes.
  await comanda.getByLabel('Códigos anotados').fill(code)
  await comanda.getByRole('button', { name: 'Lançar código' }).click()
  await expect(status).toContainText('Já estava validado.')
})

test('bar que valida na hora não lança depois', async ({ page }) => {
  const pub = await createPub()
  const { eventId } = await createGame(pub.barId, { startsAt: hours(-3) })
  const ticket = await createTicket(eventId)
  await signIn(page, pub.user)

  await page.goto('/admin/quem-vai')
  await expect(
    page.getByRole('heading', { level: 1, name: 'Quem vai' })
  ).toBeVisible()
  await expect(
    page.getByRole('region', { name: 'Lançar códigos da comanda' })
  ).toHaveCount(0)

  const refused = await page.request.post(
    '/api/trpc/reservationValidation.logLate',
    { data: { codes: [ticket.code] } }
  )
  expect(refused.status()).toBe(403)
})
