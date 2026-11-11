import { db, eq, sql } from '@findsports_oficial/db'
import { attendance } from '@findsports_oficial/db/schema/attendance'
import { user } from '@findsports_oficial/db/schema/auth'
import { friendIdsOf } from './friends'
import { visit } from './visits'

/*
 * O que o balcão vê de quem mostra o código (rodada 10 do app, "Código
 * válido"): quando marcou, quantas vezes já veio a este bar, quantos amigos
 * dela marcaram o mesmo jogo e, só de quem deixa todo mundo ver a atividade
 * (`activity_visibility` "everyone"), quantas visitas tem na Onside. Visita é
 * a de `lib/visits.ts` (código validado ou check-in); a de hoje ainda não
 * conta quando o código é lido.
 */

export type GuestStory = {
  markedAt: Date | null
  visitsHere: number
  /** `null` quando a pessoa não deixa todo mundo ver a atividade. */
  visitsOnside: number | null
  friendsToday: number
}

export async function readGuestStory(input: {
  guestId: string
  eventId: string
  barId: string
}): Promise<GuestStory> {
  const { guestId, eventId, barId } = input
  const [row] = await db
    .select({
      visibility: user.activityVisibility,
      markedAt: sql<Date | null>`(
        SELECT a.created_at FROM ${attendance} a
        WHERE a.user_id = ${guestId} AND a.event_id = ${eventId}
      )`.mapWith((value) => (value ? new Date(value) : null)),
      visitsHere: sql<number>`(
        SELECT count(*)::int FROM ${visit}
        WHERE ${visit.userId} = ${guestId} AND ${visit.barId} = ${barId}
      )`,
      visitsOnside: sql<number>`(
        SELECT count(*)::int FROM ${visit} WHERE ${visit.userId} = ${guestId}
      )`,
      friendsToday: sql<number>`(
        SELECT count(*)::int FROM ${attendance} a
        WHERE a.event_id = ${eventId} AND a.user_id IN ${friendIdsOf(guestId)}
      )`
    })
    .from(user)
    .where(eq(user.id, guestId))
  return {
    markedAt: row?.markedAt ?? null,
    visitsHere: row?.visitsHere ?? 0,
    visitsOnside: row?.visibility === 'everyone' ? row.visitsOnside : null,
    friendsToday: row?.friendsToday ?? 0
  }
}
