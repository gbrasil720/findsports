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
    starts_at: startsAt
  })
  return { eventId, championship }
}

const CODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

export type TestTicket = {
  reservationId: string
  code: string
  guestName: string
}

/**
 * Torcedor novo que marcou "Vou assistir aqui" em `eventId` num bar Elite,
 * como `attendance-ticket.ts` grava: presença, linha `confirmed` de uma
 * pessoa em `reservation` e código de uso único. Direto no banco porque o
 * `attendance.set` recusa jogo começado, e a validação precisa de jogo na
 * janela ou já encerrado.
 *
 * `unmarked` é quem desmarcou: sem presença, linha `cancelled` e código
 * aposentado.
 */
export async function createTicket(
  eventId: string,
  {
    unmarked = false,
    offerSnapshot = null
  }: { unmarked?: boolean; offerSnapshot?: string | null } = {}
): Promise<TestTicket> {
  const guestName = `Torcedor ${randomUUID().slice(0, 6)}`
  const fan = await createUser({ name: guestName })
  if (!unmarked) {
    await insert('attendance', { user_id: fan.id, event_id: eventId })
  }
  const reservationId = randomUUID()
  await insert('reservation', {
    id: reservationId,
    event_id: eventId,
    user_id: fan.id,
    party_size: 1,
    status: unmarked ? 'cancelled' : 'confirmed',
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
    max_uses: 1,
    retired_at: unmarked ? new Date() : null
  })
  return { reservationId, code, guestName }
}
