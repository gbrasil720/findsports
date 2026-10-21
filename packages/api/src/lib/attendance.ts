import {
  and,
  db,
  eq,
  inArray,
  isNull,
  type SQL,
  sql
} from '@findsports_oficial/db'
import {
  DEFAULT_EVENT_DURATION_INTERVAL,
  getEventEnd,
  getValidationWindow,
  VALIDATION_WINDOW_MARGIN_HOURS
} from '@findsports_oficial/db/event-window'
import {
  attendance,
  attendanceReport
} from '@findsports_oficial/db/schema/attendance'
import { user } from '@findsports_oficial/db/schema/auth'
import {
  bar,
  event,
  subscription
} from '@findsports_oficial/db/schema/platform'
import {
  ACTIVE_RESERVATION_STATUSES,
  reservation,
  reservationCode,
  reservationCodeUse
} from '@findsports_oficial/db/schema/reservation'
import { getCurrentPlan } from './current-plan'
import { participantNames } from './game-participants'
import { getLateEntryWindow } from './reservation-validation'

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

/** Um amigo que marcou "Vou assistir aqui" (WEB-404). */
export type GoingFriend = { id: string; name: string; image: string | null }

/** Quem vai a um jogo, como o torcedor pode ver. */
export type Going = {
  /** `null` abaixo do piso (`ATTENDANCE_DISPLAY_FLOOR`). */
  count: number | null
  /** A inicial dos três que marcaram por último; vazio abaixo do piso. */
  initials: string[]
  /** Os amigos de quem vê que deixam amigos verem, do último ao primeiro. */
  friends: GoingFriend[]
}

/**
 * Quem vai a cada jogo, para o card do Explorar, o ingresso da página do bar
 * e a folha "Vou assistir aqui" (design 2g e 3d: "34 pessoas vão, entre elas
 * Marina e Rafael"). Vale também para jogo já começado: o botão não cabe
 * mais, a contagem sim.
 *
 * - Contagem e iniciais só a partir do piso. Só a primeira letra: mostra que
 *   é gente de verdade sem identificar ninguém.
 * - Com `viewerId`, os nomes dos amigos dele que vão (`readFriendsGoing`),
 *   mesmo abaixo do piso: nome não é número de jogo vazio.
 * - O mapa só tem o jogo que tem algo a mostrar: contagem ou amigo.
 */
export async function readGoing(
  eventIds: string[],
  viewerId?: string
): Promise<Map<string, Going>> {
  if (!eventIds.length) return new Map()
  const [rows, friends] = await Promise.all([
    db
      .select({
        eventId: attendance.eventId,
        count: sql<number>`count(*)::int`,
        initials: sql<
          (string | null)[]
        >`(array_agg(upper(left(trim(${user.name}), 1)) order by ${attendance.createdAt} desc))[1:3]`
      })
      .from(attendance)
      .innerJoin(user, eq(user.id, attendance.userId))
      .where(inArray(attendance.eventId, eventIds))
      .groupBy(attendance.eventId),
    viewerId ? readFriendsGoing(viewerId, eventIds) : new Map()
  ])
  const going = new Map<string, Going>()
  for (const row of rows) {
    const shown = row.count >= ATTENDANCE_DISPLAY_FLOOR
    const mine = friends.get(row.eventId) ?? []
    if (!shown && !mine.length) continue
    going.set(row.eventId, {
      count: shown ? row.count : null,
      initials: shown
        ? row.initials.filter((letter): letter is string => Boolean(letter))
        : [],
      friends: mine
    })
  }
  return going
}

/**
 * Os amigos de `viewerId` que marcaram presença em cada jogo (WEB-404). Só
 * entra quem é amigo aceito e deixa amigos verem a atividade (11i: "todos"
 * ou "amigos"); "ninguém" nunca aparece, e quem não é amigo nunca é nomeado,
 * nem com "todos". Ordem: quem marcou por último primeiro.
 */
export async function readFriendsGoing(
  viewerId: string,
  eventIds: string[]
): Promise<Map<string, GoingFriend[]>> {
  const going = new Map<string, GoingFriend[]>()
  if (!eventIds.length) return going
  const rows = await db
    .select({
      eventId: attendance.eventId,
      id: user.id,
      name: user.name,
      image: user.image
    })
    .from(attendance)
    .innerJoin(user, eq(user.id, attendance.userId))
    .where(
      and(
        inArray(attendance.eventId, eventIds),
        inArray(user.activityVisibility, ['everyone', 'friends']),
        sql`${user.banned} IS NOT TRUE`,
        sql`EXISTS (
          SELECT 1 FROM friendship f
          WHERE f.accepted_at IS NOT NULL
            AND ((f.requester_id = ${viewerId} AND f.addressee_id = ${user.id})
              OR (f.addressee_id = ${viewerId} AND f.requester_id = ${user.id}))
        )`
      )
    )
    .orderBy(sql`${attendance.createdAt} desc`)
  for (const { eventId, ...friend } of rows)
    going.set(eventId, [...(going.get(eventId) ?? []), friend])
  return going
}

type FanAttendance = {
  attending: boolean
  /** `null` abaixo do piso. */
  count: number | null
  /** O código do balcão, só em bar Elite (`attendance-ticket.ts`). */
  code: string | null
  /** O bar já validou o código: a oferta saiu e não dá mais para desmarcar. */
  validated: boolean
}

/**
 * Estado de "Vou assistir aqui" por jogo, só onde o botão cabe: conta de
 * torcedor e jogo que não começou. Nos demais jogos, e para qualquer outra
 * conta, não há entrada: nem a prévia do dono recebe a contagem.
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
  const [counts, tickets] = await Promise.all([
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
      .select({
        eventId: reservation.eventId,
        code: reservationCode.code,
        usedCount: reservationCode.usedCount
      })
      .from(reservation)
      .innerJoin(
        reservationCode,
        and(
          eq(reservationCode.reservationId, reservation.id),
          isNull(reservationCode.retiredAt)
        )
      )
      .where(
        and(
          eq(reservation.userId, viewer.id),
          inArray(reservation.eventId, eventIds),
          inArray(reservation.status, ACTIVE_RESERVATION_STATUSES)
        )
      )
  ])
  const byEvent = new Map(counts.map((row) => [row.eventId, row]))
  const byTicket = new Map(tickets.map((row) => [row.eventId, row]))
  return new Map(
    eventIds.map((id) => {
      const row = byEvent.get(id)
      const ticket = byTicket.get(id)
      const count = row?.count ?? 0
      return [
        id,
        {
          attending: row?.attending ?? false,
          count: count >= ATTENDANCE_DISPLAY_FLOOR ? count : null,
          code: ticket?.code ?? null,
          validated: (ticket?.usedCount ?? 0) > 0
        }
      ]
    })
  )
}

// ponytail: sem paginação; o torcedor vê os 50 jogos mais recentes.
const MY_GAMES_LIMIT = 50

/**
 * "Meus jogos": os jogos em que o torcedor marcou "Vou assistir aqui", com o
 * código do balcão onde há (bar Elite). O código só sai enquanto vale, até a
 * janela de validação fechar; depois, fica só se foi validado.
 */
export async function readMyGames(userId: string, now = new Date()) {
  const rows = await db
    .select({
      eventId: event.id,
      championship: event.championship,
      participantFreeText: event.participantFreeText,
      participants: participantNames(sql`${event.id}`),
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      barId: bar.id,
      barName: bar.name,
      neighborhood: bar.neighborhood,
      photoUrl: bar.photoUrl,
      // Bar fora do ar segue na lista, sem perfil para abrir (WEB-360).
      barActive: bar.isActive,
      // Bar que confirma pela comanda (WEB-412): o código vai anotado e o
      // dono lança depois, então só conta como perdido quando o prazo dele
      // acabar.
      confirmsCodesLater: bar.confirmsCodesLater,
      plan: subscription.plan,
      planStatus: subscription.status,
      currentPeriodEnd: subscription.currentPeriodEnd,
      offer: reservation.offerSnapshot,
      code: reservationCode.code,
      usedCount: reservationCode.usedCount
    })
    .from(attendance)
    .innerJoin(event, eq(event.id, attendance.eventId))
    .innerJoin(bar, eq(bar.id, event.barId))
    .leftJoin(subscription, eq(subscription.barId, bar.id))
    .leftJoin(
      reservation,
      and(
        eq(reservation.userId, attendance.userId),
        eq(reservation.eventId, attendance.eventId),
        inArray(reservation.status, ACTIVE_RESERVATION_STATUSES)
      )
    )
    .leftJoin(
      reservationCode,
      and(
        eq(reservationCode.reservationId, reservation.id),
        isNull(reservationCode.retiredAt)
      )
    )
    .where(eq(attendance.userId, userId))
    .orderBy(sql`${event.startsAt} desc`)
    .limit(MY_GAMES_LIMIT)

  return rows.map(
    ({
      code,
      usedCount,
      endsAt,
      plan,
      planStatus,
      currentPeriodEnd,
      ...row
    }) => {
      const window = getValidationWindow({ startsAt: row.startsAt, endsAt })
      // Pela comanda só vale com o Elite: o bar que perdeu o plano não lança mais.
      const confirmsCodesLater =
        row.confirmsCodesLater &&
        getCurrentPlan(
          plan && planStatus
            ? { plan, status: planStatus, currentPeriodEnd }
            : null,
          now
        ) === 'elite'
      const lastChance = confirmsCodesLater
        ? getLateEntryWindow({ startsAt: row.startsAt, endsAt }).closesAt
        : window.closesAt
      const validated = (usedCount ?? 0) > 0
      const end = getEventEnd({ startsAt: row.startsAt, endsAt })
      return {
        ...row,
        confirmsCodesLater,
        // O fim já resolvido (o informado pelo bar, senão o padrão): a agenda
        // do celular usa o mesmo que o servidor.
        endsAt: end,
        ended: end <= now,
        // `null`: bar sem Elite quando o torcedor marcou, ou janela fechada sem
        // validação.
        code: code && (validated || window.closesAt >= now) ? code : null,
        window: code ? window : null,
        validated,
        // Bar Elite que emitiu código e o jogo passou sem validação.
        missed: code !== null && !validated && lastChance < now
      }
    }
  )
}

/**
 * "Já fui" e "Bares" de Seus bares (17b, 17e do design): cada jogo em que o torcedor teve o
 * código validado no balcão, do mais recente ao mais antigo. É a mesma visita
 * das conquistas (`achievements-read.ts`); o check-in do WEB-408 entra nas
 * duas. Bar fora do ar segue na lista, sem perfil para abrir.
 */
export async function readVisitedGames(userId: string) {
  return db
    .selectDistinctOn([event.id], {
      eventId: event.id,
      championship: event.championship,
      participantFreeText: event.participantFreeText,
      participants: participantNames(sql`${event.id}`),
      startsAt: event.startsAt,
      validatedAt: reservationCodeUse.usedAt,
      barId: bar.id,
      barName: bar.name,
      neighborhood: bar.neighborhood,
      // A aba "Bares" (17e) mostra a foto e a distância de quem já foi.
      photoUrl: bar.photoUrl,
      latitude: bar.latitude,
      longitude: bar.longitude,
      barActive: bar.isActive
    })
    .from(reservationCodeUse)
    .innerJoin(
      reservationCode,
      eq(reservationCode.id, reservationCodeUse.codeId)
    )
    .innerJoin(reservation, eq(reservation.id, reservationCode.reservationId))
    .innerJoin(event, eq(event.id, reservation.eventId))
    .innerJoin(bar, eq(bar.id, event.barId))
    .where(
      and(eq(reservation.userId, userId), isNull(reservationCodeUse.undoneAt))
    )
    .orderBy(event.id, reservationCodeUse.usedAt)
    .then((rows) =>
      rows.sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime())
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
