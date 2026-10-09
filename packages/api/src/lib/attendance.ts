import { and, db, eq, inArray, type SQL, sql } from '@findsports_oficial/db'
import {
  DEFAULT_EVENT_DURATION_INTERVAL,
  VALIDATION_WINDOW_MARGIN_HOURS
} from '@findsports_oficial/db/event-window'
import {
  attendance,
  attendanceReport
} from '@findsports_oficial/db/schema/attendance'
import { bar, event } from '@findsports_oficial/db/schema/platform'
import {
  ACTIVE_RESERVATION_STATUSES,
  reservation,
  reservationCode,
  reservationCodeUse
} from '@findsports_oficial/db/schema/reservation'
import { participantNames } from './game-participants'

/**
 * Presença confirmada (WEB-127, ADR 0003). Os números daqui só saem do
 * servidor já resolvidos: o torcedor recebe a contagem a partir do piso, e o
 * bar recebe só o sinal relativo, nunca a contagem.
 */

/** Fim derivado em SQL, o mesmo de `getEventEnd`. */
const eventEnd = sql`coalesce(${event.endsAt}, ${event.startsAt} + ${DEFAULT_EVENT_DURATION_INTERVAL}::interval)`

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
      ended: sql<boolean>`${eventEnd} <= now()`,
      count: sql<number>`count(${attendance.userId})::int`
    })
    .from(event)
    .leftJoin(attendance, eq(attendance.eventId, event.id))
    .where(eq(event.barId, barId))
    .groupBy(event.id)
  return interestSignal(games)
}

/**
 * Por quanto tempo depois do jogo o torcedor ainda recebe a pergunta "você
 * foi?" (WEB-128). Mesma razão de `RATING_WINDOW_DAYS`: depois disso é
 * memória, não observação.
 */
export const ATTENDANCE_REPORT_WINDOW_DAYS = 14

/**
 * Jogos em que o padrão "torcedor diz que foi, bar não registrou" precisa se
 * repetir para o bar entrar no alerta interno. Palpite, como os números da
 * ADR 0003: um jogo isolado é ruído de resposta.
 */
export const UNREGISTERED_ALERT_MIN_GAMES = 3

/**
 * Perguntas pós-jogo que o torcedor ainda pode responder: jogos em que ele
 * marcou presença (reserva também marca), já encerrados e dentro da janela.
 * `offer` vem da reserva confirmada com oferta congelada; sem ela, só se
 * pergunta se foi — presença nunca dá brinde.
 */
export async function readAttendanceQuestions(
  userId: string,
  eventId?: string
) {
  return db
    .select({
      eventId: event.id,
      championship: event.championship,
      participantFreeText: event.participantFreeText,
      participants: participantNames(sql`${event.id}`),
      startsAt: event.startsAt,
      barName: bar.name,
      neighborhood: bar.neighborhood,
      offer: reservation.offerSnapshot,
      answered: sql<boolean>`${attendanceReport.userId} IS NOT NULL`
    })
    .from(attendance)
    .innerJoin(event, eq(event.id, attendance.eventId))
    .innerJoin(bar, eq(bar.id, event.barId))
    .leftJoin(
      reservation,
      and(
        eq(reservation.userId, attendance.userId),
        eq(reservation.eventId, attendance.eventId),
        eq(reservation.status, 'confirmed')
      )
    )
    .leftJoin(
      attendanceReport,
      and(
        eq(attendanceReport.userId, attendance.userId),
        eq(attendanceReport.eventId, attendance.eventId)
      )
    )
    .where(
      and(
        eq(attendance.userId, userId),
        eventId ? eq(attendance.eventId, eventId) : undefined,
        eq(bar.isActive, true),
        sql`${eventEnd} <= now()`,
        sql`${eventEnd} > now() - ${`${ATTENDANCE_REPORT_WINDOW_DAYS} days`}::interval`
      )
    )
    .orderBy(sql`${event.startsAt} desc`)
}

/**
 * Alerta interno (WEB-128): bares em que o torcedor diz que foi e o bar não
 * registrou, repetidamente. Só entra jogo com a janela de validação fechada —
 * antes disso o bar ainda pode registrar. Não julga nem sanciona: mostra o
 * cruzamento das quatro leituras por bar, sem nenhuma resposta individual.
 */
export function readUnregisteredAlerts() {
  const registered = sql`exists (
    select 1 from ${reservationCodeUse}
    join ${reservationCode} on ${reservationCode.id} = ${reservationCodeUse.codeId}
    where ${reservationCode.reservationId} = ${reservation.id}
      and ${reservationCodeUse.undoneAt} is null
  )`
  const went = attendanceReport.attended
  const tally = (reading: SQL) =>
    sql<number>`(count(*) filter (where ${reading}))::int`
  const unregisteredGames = sql<number>`(count(distinct ${event.id}) filter (where ${went} and not ${registered}))::int`
  return db
    .select({
      barId: bar.id,
      barName: bar.name,
      unregisteredGames,
      bothRegistered: tally(sql`${went} and ${registered}`),
      unregistered: tally(sql`${went} and not ${registered}`),
      burned: tally(sql`not ${went} and ${registered}`),
      noShow: tally(sql`not ${went} and not ${registered}`)
    })
    .from(reservation)
    .innerJoin(
      attendanceReport,
      and(
        eq(attendanceReport.userId, reservation.userId),
        eq(attendanceReport.eventId, reservation.eventId)
      )
    )
    .innerJoin(event, eq(event.id, reservation.eventId))
    .innerJoin(bar, eq(bar.id, event.barId))
    .where(
      and(
        eq(reservation.status, 'confirmed'),
        sql`${eventEnd} + ${`${VALIDATION_WINDOW_MARGIN_HOURS} hours`}::interval < now()`
      )
    )
    .groupBy(bar.id)
    .having(sql`${unregisteredGames} >= ${UNREGISTERED_ALERT_MIN_GAMES}`)
    .orderBy(sql`${unregisteredGames} desc`, bar.name)
}
