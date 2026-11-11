import { db, inArray, sql } from '@findsports_oficial/db'
import { user } from '@findsports_oficial/db/schema/auth'
import type { GoingFriend } from './attendance'
import { ATTENDANCE_DISPLAY_FLOOR } from './attendance-floor'
import { visit } from './visits'

/**
 * "No bar agora" do jogo ao vivo (rodada 8, tela 1): quem já está lá, pela
 * visita (código validado no balcão ou check-in "Estou aqui"). A contagem tem
 * o mesmo piso da presença (`ATTENDANCE_DISPLAY_FLOOR`), e os amigos são só
 * os aceitos que deixam amigos verem, como em "quem vai" (`readFriendsGoing`).
 * A Onside não sabe quem saiu: durante o jogo, quem chegou conta como lá.
 */
export type HereNow = { count: number | null; friends: GoingFriend[] }

export async function readHereNow(
  eventIds: string[],
  viewerId?: string
): Promise<Map<string, HereNow>> {
  const here = new Map<string, HereNow>()
  if (!eventIds.length) return here
  const [counts, friends] = await Promise.all([
    db
      .select({
        eventId: visit.eventId,
        count: sql<number>`count(*)::int`
      })
      .from(visit)
      .innerJoin(user, sql`${user.id} = ${visit.userId}`)
      .where(
        sql`${inArray(visit.eventId, eventIds)} AND ${user.banned} IS NOT TRUE`
      )
      .groupBy(visit.eventId),
    viewerId
      ? db
          .select({
            eventId: visit.eventId,
            id: user.id,
            name: user.name,
            image: user.image
          })
          .from(visit)
          .innerJoin(user, sql`${user.id} = ${visit.userId}`)
          .where(
            sql`${visit.eventId} IN ${eventIds}
              AND ${user.activityVisibility} IN ('everyone', 'friends')
              AND ${user.banned} IS NOT TRUE
              AND EXISTS (
                SELECT 1 FROM friendship f
                WHERE f.accepted_at IS NOT NULL
                  AND ((f.requester_id = ${viewerId} AND f.addressee_id = ${user.id})
                    OR (f.addressee_id = ${viewerId} AND f.requester_id = ${user.id}))
              )`
          )
          .orderBy(sql`${visit.visitedAt} desc`)
      : Promise.resolve([])
  ])
  for (const row of counts) {
    here.set(row.eventId, {
      count: row.count >= ATTENDANCE_DISPLAY_FLOOR ? row.count : null,
      friends: []
    })
  }
  for (const { eventId, ...friend } of friends) {
    const entry = here.get(eventId) ?? { count: null, friends: [] }
    entry.friends.push(friend)
    here.set(eventId, entry)
  }
  return here
}
