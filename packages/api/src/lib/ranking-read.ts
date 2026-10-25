import { db, eq, sql } from '@findsports_oficial/db'
import { user } from '@findsports_oficial/db/schema/auth'
import { readReviewsOf, readVisitsOf } from './achievements-read'
import { canSeeActivity, friendIdsOf, monthStart } from './friends'
import {
  chaseOf,
  MOVE_WINDOW_MS,
  monthOf,
  type RankingMetric,
  rank,
  scoreOf
} from './ranking'
import { visit } from './visits'

/**
 * O ranking dos amigos (10d): você e os amigos aceitos que deixam os amigos
 * ver a atividade (11i, `canSeeActivity`, a mesma regra do perfil de
 * amigo). Quem escolheu "Ninguém" não entra, nem com zero.
 */
export async function readFriendsRanking(
  me: string,
  metric: RankingMetric,
  now = new Date()
) {
  const people = (
    await db
      .select({
        id: user.id,
        name: user.name,
        username: user.username,
        city: user.searchCityName,
        image: user.image,
        visibility: user.activityVisibility
      })
      .from(user)
      .where(
        sql`${user.id} = ${me} OR (${user.id} IN ${friendIdsOf(me)}
          AND ${user.role} = 'fan' AND ${user.banned} IS NOT TRUE)`
      )
  ).filter((p) => p.id === me || canSeeActivity(p.visibility, 'friends'))
  const ids = people.map((p) => p.id)
  const [visits, reviews] = await Promise.all([
    readVisitsOf(ids),
    metric === 'achievements' ? readReviewsOf(ids) : Promise.resolve([])
  ])
  const start = monthStart(now)
  const board = (to: Date) =>
    rank(
      people.map(({ visibility, ...person }) => ({
        ...person,
        me: person.id === me,
        score: scoreOf(
          metric,
          visits.filter((v) => v.userId === person.id),
          reviews.filter((r) => r.userId === person.id),
          start,
          to
        )
      }))
    )
  const rows = board(now)
  // As setas comparam com uma semana atrás; no começo do mês, sem setas.
  const weekAgo = new Date(now.getTime() - MOVE_WINDOW_MS)
  const before =
    weekAgo >= start
      ? new Map(board(weekAgo).map((row) => [row.id, row.position]))
      : null
  return {
    ...monthOf(now),
    metric,
    rows: rows.map(({ score, ...row }) => {
      const was = before?.get(row.id)
      return {
        ...row,
        value: score.value,
        move: was === undefined ? null : was - row.position
      }
    }),
    chase: chaseOf(rows)
  }
}

/**
 * "Você está em 1.284º em São Paulo": a sua posição em bares diferentes no
 * mês entre os torcedores com a mesma cidade no perfil. Só o número; a lista
 * da cidade não sai (o "Aparecer no ranking global" das Configurações ainda
 * não existe). Sem cidade no perfil, nulo.
 *
 * ponytail: agrega as visitas do mês de todo mundo a cada leitura; com muito
 * volume, vira tabela do mês fechada por job ou cache curto por cidade.
 */
export async function readCityPosition(me: string, now = new Date()) {
  const [mine] = await db
    .select({ city: user.searchCityName, uf: user.searchCityUf })
    .from(user)
    .where(eq(user.id, me))
  if (!mine?.city) return null
  const start = monthStart(now)
  const result = await db.execute<{ total: number; position: number }>(sql`
    WITH firsts AS (
      SELECT ${visit.userId} AS user_id, ${visit.barId} AS bar_id, min(e.starts_at) AS at
      FROM ${visit}
      JOIN event e ON e.id = ${visit.eventId}
      WHERE e.starts_at >= (${start.toISOString()}::timestamptz AT TIME ZONE 'UTC')
        AND e.starts_at < (${now.toISOString()}::timestamptz AT TIME ZONE 'UTC')
      GROUP BY 1, 2
    ), scores AS (
      SELECT user_id, count(*) AS value, max(at) AS reached
      FROM firsts GROUP BY user_id
    ), people AS (
      SELECT u.id, coalesce(s.value, 0) AS value, s.reached
      FROM "user" u
      LEFT JOIN scores s ON s.user_id = u.id
      WHERE u.role = 'fan' AND u.banned IS NOT TRUE
        AND u.search_city_name = ${mine.city}
        AND u.search_city_uf IS NOT DISTINCT FROM ${mine.uf}
    )
    SELECT
      (SELECT count(*) FROM people)::int AS total,
      (SELECT 1 + count(*) FROM people p, people m
        WHERE m.id = ${me} AND p.id <> m.id
          AND (p.value > m.value
            OR (p.value = m.value AND p.value > 0 AND p.reached < m.reached))
      )::int AS position
  `)
  const row = result.rows[0]
  if (!row) return null
  return { city: mine.city, position: row.position, total: row.total }
}
