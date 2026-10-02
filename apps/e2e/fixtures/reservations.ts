import { randomInt, randomUUID } from 'node:crypto'
import { insert, query } from './db'
import { createUser } from './users'

const HOUR = 3_600_000

/** Id do futebol que o setup semeia. */
export async function soccerSportId(): Promise<string> {
  const [sport] = await query<{ id: string }>(
    "SELECT id FROM sport WHERE slug = 'futebol'"
  )
  if (!sport) throw new Error('Esporte futebol não semeado')
  return sport.id
}

/**
 * Jogo de um bar. `startsAt` padrão: daqui a uma hora — dentro da janela de
 * validação do código (abre 3h antes do início). Esporte: futebol semeado.
 *
 * `event.starts_at` é `timestamp` sem fuso e o app grava em UTC: a data vai
 * como ISO em UTC, e o Postgres descarta o `Z`.
 */
export async function createEvent(
  barId: string,
  {
    startsAt = new Date(Date.now() + HOUR),
    championship = `Campeonato E2E ${randomUUID().slice(0, 6)}`
  }: { startsAt?: Date; championship?: string } = {}
): Promise<{ eventId: string; championship: string }> {
  const eventId = randomUUID()
  await insert('event', {
    id: eventId,
    bar_id: barId,
    sport_id: await soccerSportId(),
    championship,
    starts_at: startsAt.toISOString()
  })
  return { eventId, championship }
}

const CODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

export type TestReservation = {
  reservationId: string
  code: string
  guestName: string
}

/**
 * Pedido de reserva de um torcedor novo para `eventId`, com o código ativo
 * que o torcedor mostraria no bar (6 caracteres, `max_uses = party_size`,
 * como a migration 0034 exige).
 */
export async function createReservation(
  eventId: string,
  {
    status = 'confirmed',
    partySize = 2,
    offerSnapshot = null
  }: {
    status?: 'pending' | 'confirmed' | 'declined' | 'cancelled'
    partySize?: number
    offerSnapshot?: string | null
  } = {}
): Promise<TestReservation> {
  const guestName = `Torcedor ${randomUUID().slice(0, 6)}`
  const fan = await createUser({ name: guestName })
  const reservationId = randomUUID()
  await insert('reservation', {
    id: reservationId,
    event_id: eventId,
    user_id: fan.id,
    party_size: partySize,
    status,
    offer_snapshot: offerSnapshot
  })
  const code = Array.from(
    { length: 6 },
    () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]
  ).join('')
  await insert('reservation_code', {
    id: randomUUID(),
    code,
    reservation_id: reservationId,
    max_uses: partySize
  })
  return { reservationId, code, guestName }
}
