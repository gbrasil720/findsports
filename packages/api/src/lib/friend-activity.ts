import { db, sql } from '@findsports_oficial/db'
import {
  brasiliaTodaySql,
  eventNotEndedSql,
  onBrasiliaDaysSql
} from '@findsports_oficial/db/event-window-sql'
import { user } from '@findsports_oficial/db/schema/auth'
import {
  type AchievementId,
  computeAchievements,
  LEVELS,
  type Review,
  type Visit
} from './achievements'
import { readReviewsOf, readVisitsOf } from './achievements-read'
import { canSeeActivity, friendIdsOf } from './friends'
import { gameTitle } from './game-participants'
import { utcIso } from './utc-timestamp'

/*
 * O que a galera está fazendo (rodada 6, tela de amigos): hoje, os bares onde
 * os amigos vão; e a atividade das duas últimas semanas (validou o código,
 * ganhou medalha, subiu de nível). Só leitura das visitas e conquistas, e só
 * de quem deixa os amigos verem a atividade ("Onde você foi", 11i).
 */

const FEED_DAYS = 14
const FEED_SIZE = 20

type Person = { id: string; name: string; image: string | null }

export type FeedItem =
  | { kind: 'visit'; at: string; person: Person; barName: string }
  | { kind: 'medal'; at: string; person: Person; medalId: AchievementId }
  | {
      kind: 'level'
      at: string
      person: Person
      level: number
      levelName: string
    }

/** A atividade de cada um, a mais nova primeiro, das últimas duas semanas. */
export function feedOf(
  people: Person[],
  visits: (Visit & { userId: string })[],
  reviews: (Review & { userId: string })[],
  now: Date
): FeedItem[] {
  const since = now.getTime() - FEED_DAYS * 86_400_000
  const items: FeedItem[] = []
  for (const person of people) {
    const theirs = visits.filter((v) => v.userId === person.id)
    for (const v of theirs)
      if (v.at.getTime() >= since && v.at <= now)
        items.push({
          kind: 'visit',
          at: v.at.toISOString(),
          person,
          barName: v.barName
        })
    const unlocked = computeAchievements(
      theirs,
      reviews.filter((r) => r.userId === person.id)
    )
      .filter((a) => a.unlockedAt)
      .sort(
        (a, b) =>
          new Date(a.unlockedAt as string | Date).getTime() -
          new Date(b.unlockedAt as string | Date).getTime()
      )
    unlocked.forEach((a, index) => {
      const at = new Date(a.unlockedAt as string | Date)
      if (at.getTime() < since) return
      items.push({ kind: 'medal', at: at.toISOString(), person, medalId: a.id })
      // A conquista que completa a conta de um nível sobe a pessoa.
      const reached = LEVELS.find((l) => l.from === index + 1)
      if (reached)
        items.push({
          kind: 'level',
          at: at.toISOString(),
          person,
          level: reached.level,
          levelName: reached.name
        })
    })
  }
  // A medalha conta pela data do jogo: jogo futuro não entra no feed.
  const until = now.toISOString()
  return items
    .filter((item) => item.at <= until)
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, FEED_SIZE)
}

/** Os amigos aceitos que deixam os amigos ver a atividade. */
async function visibleFriends(me: string): Promise<Person[]> {
  const rows = await db
    .select({
      id: user.id,
      name: user.name,
      image: user.image,
      visibility: user.activityVisibility
    })
    .from(user)
    .where(sql`${user.id} IN ${friendIdsOf(me)} AND ${user.role} = 'fan'
      AND ${user.banned} IS NOT TRUE`)
  return rows
    .filter((row) => canSeeActivity(row.visibility, 'friends'))
    .map(({ visibility, ...person }) => person)
}

export async function readFriendsFeed(me: string, now = new Date()) {
  const people = await visibleFriends(me)
  if (!people.length) return []
  const ids = people.map((p) => p.id)
  const [visits, reviews] = await Promise.all([
    readVisitsOf(ids),
    readReviewsOf(ids)
  ])
  return feedOf(people, visits, reviews, now)
}

/**
 * Hoje (rodada 6): os jogos de hoje que ainda não acabaram onde algum amigo
 * marcou presença, com quem vai e se você já vai.
 */
export async function readFriendsToday(me: string, now = new Date()) {
  const people = await visibleFriends(me)
  if (!people.length) return []
  const ids = people.map((p) => p.id)
  const rows = await db.execute<{
    event_id: string
    bar_id: string
    bar_name: string
    photo_url: string | null
    starts_at: string
    title: string
    friend_ids: string[]
    mine: boolean
  }>(sql`
    SELECT e.id AS event_id, b.id AS bar_id, b.name AS bar_name,
      b.photo_url, e.starts_at,
      ${gameTitle({
        id: sql`e.id`,
        participantFreeText: sql`e.participant_free_text`,
        championship: sql`e.championship`
      })} AS title,
      array_agg(a.user_id ORDER BY a.created_at DESC) AS friend_ids,
      EXISTS (
        SELECT 1 FROM attendance m WHERE m.event_id = e.id AND m.user_id = ${me}
      ) AS mine
    FROM attendance a
    JOIN event e ON e.id = a.event_id
    JOIN bar b ON b.id = e.bar_id
    WHERE a.user_id IN ${ids}
      AND b.is_active AND e.published_at IS NOT NULL
      AND ${onBrasiliaDaysSql(sql`e.starts_at`, brasiliaTodaySql(now), 1)}
      AND ${eventNotEndedSql('e', now)}
    GROUP BY e.id, b.id
    ORDER BY e.starts_at
  `)
  const byId = new Map(people.map((p) => [p.id, p]))
  return rows.rows.map((row) => ({
    eventId: row.event_id,
    barId: row.bar_id,
    barName: row.bar_name,
    photoUrl: row.photo_url,
    title: row.title,
    startsAt: utcIso(row.starts_at),
    mine: row.mine,
    friends: row.friend_ids.flatMap((id) => {
      const person = byId.get(id)
      return person ? [person] : []
    })
  }))
}
