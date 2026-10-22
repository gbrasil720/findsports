import { and, db, eq, or, sql } from '@findsports_oficial/db'
import { user } from '@findsports_oficial/db/schema/auth'
import { event } from '@findsports_oficial/db/schema/platform'
import { friendCall } from '@findsports_oficial/db/schema/social'
import { TRPCError } from '@trpc/server'
import { readFriendship } from './friends'
import { participantNames } from './game-participants'
import { utcIso } from './utc-timestamp'

/*
 * Chamado de amigo ("Chamar Marina", Rodada 24). Quem cria é `ai.confirm`
 * (a IA propõe, o torcedor confirma); quem responde é `friends.respondCall`;
 * o card mora em Avisos (`friends.notices`). Sem push (WEB-416).
 */

export type FriendCallResult =
  | { ok: true; callId: string; friendName: string }
  | { ok: false; reason: 'not_friends' | 'duplicate' | 'past_game' }

/**
 * Chama um amigo aceito para um jogo num bar. Um chamado por (de, para,
 * jogo): repetir devolve `duplicate` e não cria outro. Jogo começado recusa,
 * a mesma regra do `attendance.set`: o "Vou também" não teria como marcar
 * presença. Bar fora do ar conta como jogo inexistente.
 */
export async function createFriendCall(input: {
  fromUserId: string
  toUserId: string
  eventId: string
  barId: string
}): Promise<FriendCallResult> {
  const { fromUserId, toUserId, eventId, barId } = input
  const relation = await readFriendship(fromUserId, toUserId)
  if (!relation?.acceptedAt || fromUserId === toUserId)
    return { ok: false, reason: 'not_friends' }
  const game = await db.query.event.findFirst({
    where: eq(event.id, eventId),
    columns: { barId: true, startsAt: true },
    with: { bar: { columns: { isActive: true } } }
  })
  if (!game?.bar.isActive || game.barId !== barId)
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Jogo não encontrado.' })
  if (game.startsAt <= new Date()) return { ok: false, reason: 'past_game' }
  const [created] = await db
    .insert(friendCall)
    .values({ fromUserId, toUserId, eventId, barId })
    .onConflictDoNothing()
    .returning({ id: friendCall.id })
  if (!created) return { ok: false, reason: 'duplicate' }
  const [friend] = await db
    .select({ name: user.name })
    .from(user)
    .where(eq(user.id, toUserId))
  return { ok: true, callId: created.id, friendName: friend?.name ?? '' }
}

/** Um chamado como Avisos mostra: a outra pessoa, o jogo e o bar. */
export type CallNotice = {
  id: string
  status: 'pending' | 'going' | 'not_now'
  at: string
  person: { id: string; name: string; image: string | null }
  eventId: string
  barId: string
  barName: string
  startsAt: string
  championship: string
  participants: string[]
  participantFreeText: string | null
}

type Row = {
  id: string
  status: CallNotice['status']
  at: string
  person_id: string
  person_name: string
  person_image: string | null
  event_id: string
  bar_id: string
  bar_name: string
  starts_at: string
  championship: string
  participants: string[]
  participant_free_text: string | null
}

/**
 * Os chamados de Avisos, dos últimos `days` dias. `received`: os que a
 * pessoa recebeu, com o estado; pendente some quando o jogo começa (não dá
 * mais para marcar presença). `accepted`: os que ela fez e o amigo respondeu
 * "Vou também". "Agora não" não chega a quem chamou (design).
 */
export async function readCallNotices(me: string, days: number) {
  const since = new Date(Date.now() - days * 86_400_000)
  const read = (received: boolean) =>
    db.execute<Row>(sql`
      SELECT c.id, c.status,
        ${received ? sql`c.created_at` : sql`c.responded_at`} AS at,
        u.id AS person_id, u.name AS person_name, u.image AS person_image,
        e.id AS event_id, e.starts_at, e.championship,
        e.participant_free_text,
        ${participantNames(sql`e.id`)} AS participants,
        b.id AS bar_id, b.name AS bar_name
      FROM friend_call c
      JOIN "user" u ON u.id = ${received ? sql`c.from_user_id` : sql`c.to_user_id`}
        AND u.banned IS NOT TRUE
      JOIN event e ON e.id = c.event_id
      JOIN bar b ON b.id = c.bar_id AND b.is_active
      WHERE ${
        received
          ? sql`c.to_user_id = ${me} AND c.created_at >= ${since}
              AND (c.status <> 'pending' OR e.starts_at > now() AT TIME ZONE 'UTC')`
          : sql`c.from_user_id = ${me} AND c.status = 'going'
              AND c.responded_at >= ${since}`
      }
      ORDER BY at DESC
    `)
  const shape = (row: Row): CallNotice => ({
    id: row.id,
    status: row.status,
    at: utcIso(row.at),
    person: {
      id: row.person_id,
      name: row.person_name,
      image: row.person_image
    },
    eventId: row.event_id,
    barId: row.bar_id,
    barName: row.bar_name,
    startsAt: utcIso(row.starts_at),
    championship: row.championship,
    participants: row.participants,
    participantFreeText: row.participant_free_text
  })
  const [received, accepted] = await Promise.all([read(true), read(false)])
  return {
    calls: received.rows.map(shape),
    callsAccepted: accepted.rows.map(shape)
  }
}
