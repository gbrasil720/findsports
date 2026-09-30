import { and, db, eq, inArray, sql } from '@findsports_oficial/db'
import { DEFAULT_EVENT_DURATION_INTERVAL } from '@findsports_oficial/db/event-window'
import { attendance } from '@findsports_oficial/db/schema/attendance'
import { event } from '@findsports_oficial/db/schema/platform'
import {
  ACTIVE_RESERVATION_STATUSES,
  reservation
} from '@findsports_oficial/db/schema/reservation'

/**
 * Presença confirmada (WEB-127, ADR 0003). Os números daqui só saem do
 * servidor já resolvidos: o torcedor recebe a contagem a partir do piso, e o
 * bar recebe só o sinal relativo, nunca a contagem.
 */

/** Piso de exibição (WEB-123). Abaixo dele, só o botão. */
export const ATTENDANCE_DISPLAY_FLOOR = 15

/**
 * Histórico suficiente para o sinal (WEB-122): jogos encerrados do bar com
 * pelo menos uma presença. Valor provisório da ADR.
 */
export const INTEREST_MIN_HISTORY = 5

type FanAttendance = {
  attending: boolean
  /** `null` abaixo do piso. */
  count: number | null
}

/**
 * Estado de "Vou assistir aqui" por jogo, só onde o botão cabe: conta de
 * torcedor, jogo que não começou e sem pedido de reserva ativo (a reserva já
 * marcou presença). Nos demais jogos, e para qualquer outra conta, não há
 * entrada: nem a prévia do dono recebe a contagem.
 */
export async function readFanAttendance(
  viewer: { id: string; role: string },
  games: { id: string; startsAt: Date }[],
  now = new Date()
): Promise<Map<string, FanAttendance>> {
  const eventIds = games
    .filter((game) => game.startsAt > now)
    .map((game) => game.id)
  if (viewer.role !== 'fan' || !eventIds.length) return new Map()
  const [counts, reserved] = await Promise.all([
    db
      .select({
        eventId: attendance.eventId,
        count: sql<number>`count(*)::int`,
        attending: sql<boolean>`bool_or(${attendance.userId} = ${viewer.id})`
      })
      .from(attendance)
      .where(inArray(attendance.eventId, eventIds))
      .groupBy(attendance.eventId),
    db
      .select({ eventId: reservation.eventId })
      .from(reservation)
      .where(
        and(
          eq(reservation.userId, viewer.id),
          inArray(reservation.eventId, eventIds),
          inArray(reservation.status, ACTIVE_RESERVATION_STATUSES)
        )
      )
  ])
  const byEvent = new Map(counts.map((row) => [row.eventId, row]))
  const reservedIds = new Set(reserved.map((row) => row.eventId))
  return new Map(
    eventIds
      .filter((id) => !reservedIds.has(id))
      .map((id) => {
        const row = byEvent.get(id)
        const count = row?.count ?? 0
        return [
          id,
          {
            attending: row?.attending ?? false,
            count: count >= ATTENDANCE_DISPLAY_FLOOR ? count : null
          }
        ]
      })
  )
}

export type InterestSignal =
  | { status: 'gathering' }
  | { status: 'ready'; events: { eventId: string; ratio: number }[] }

/**
 * Sinal de interesse (WEB-122): presenças do jogo divididas pela média dos
 * jogos encerrados do bar que tiveram presença. Sem histórico suficiente não
 * há número nem faixa. A razão sai com uma casa: é sinal, não medida.
 */
export function interestSignal(
  games: { eventId: string; ended: boolean; count: number }[]
): InterestSignal {
  const history = games.filter((game) => game.ended && game.count > 0)
  if (history.length < INTEREST_MIN_HISTORY) return { status: 'gathering' }
  const baseline =
    history.reduce((sum, game) => sum + game.count, 0) / history.length
  return {
    status: 'ready',
    events: games
      .filter((game) => !game.ended)
      .map((game) => ({
        eventId: game.eventId,
        ratio: Math.round((game.count / baseline) * 10) / 10
      }))
  }
}

// ponytail: lê a agenda inteira do bar; limitar a janela se a agenda crescer.
export async function readInterestSignal(
  barId: string
): Promise<InterestSignal> {
  const games = await db
    .select({
      eventId: event.id,
      ended: sql<boolean>`coalesce(${event.endsAt}, ${event.startsAt} + ${DEFAULT_EVENT_DURATION_INTERVAL}::interval) <= now()`,
      count: sql<number>`count(${attendance.userId})::int`
    })
    .from(event)
    .leftJoin(attendance, eq(attendance.eventId, event.id))
    .where(eq(event.barId, barId))
    .groupBy(event.id)
  return interestSignal(games)
}
