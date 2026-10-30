import { db, eq, sql } from '@findsports_oficial/db'
import { user } from '@findsports_oficial/db/schema/auth'
import { readReviewsOf, readVisitsOf } from './achievements-read'
import { canSeeActivity, friendIdsOf, monthStart } from './friends'
import {
  CITY_AROUND,
  CITY_PAGE,
  CITY_TOP,
  type CityMetric,
  chaseOf,
  listedInCity,
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
 * O ranking da cidade (10e, 27a–27c; WEB-465): os torcedores com a mesma
 * cidade no perfil que estão na lista (`listedInCity`), na métrica do mês. A
 * posição sai de `row_number` no banco (mais alto; empate, quem chegou antes;
 * com zero, pelo nome), então a página de "ver mais" e a sua posição são da
 * mesma conta.
 *
 * Página por posição: `cursor` 0 traz o top (`CITY_TOP`), os seguintes
 * `CITY_PAGE` cada. Toda página traz também a sua vizinhança (`around`, você
 * e `CITY_AROUND` de cada lado), que o app mantém fixa abaixo do corte.
 *
 * Sem cidade no perfil, nulo. Fora da lista, só a cidade e por que está fora:
 * nem a própria posição sai (27c).
 *
 * ponytail: agrega as visitas do mês da cidade a cada leitura (medido em
 * `ranking.integration.test.ts` com 5 mil torcedores); com muito volume, vira
 * tabela do mês fechada por job ou cache curto por cidade.
 */
export async function readCityBoard(
  me: string,
  metric: CityMetric,
  cursor = 0,
  now = new Date()
) {
  const [mine] = await db
    .select({
      city: user.searchCityName,
      uf: user.searchCityUf,
      rankingGlobal: user.rankingGlobal,
      visibility: user.activityVisibility
    })
    .from(user)
    .where(eq(user.id, me))
  if (!mine?.city) return null
  if (!listedInCity(mine.rankingGlobal, mine.visibility))
    return {
      listed: false as const,
      city: mine.city,
      rankingGlobal: mine.rankingGlobal,
      // Ligou, mas "Ninguém" em "Onde você foi" a deixa de fora.
      nobody: mine.visibility === 'nobody'
    }
  const size = cursor === 0 ? CITY_TOP : CITY_PAGE
  const start = monthStart(now)
  const key = metric === 'bars' ? visit.barId : visit.eventId
  /** A cidade em ordem com as visitas do mês até `to`. */
  const ranked = (to: Date) => sql`
    people AS (
      SELECT u.id, u.name, u.username
      FROM "user" u
      WHERE u.role = 'fan' AND u.banned IS NOT TRUE
        AND u.ranking_global AND u.activity_visibility <> 'nobody'
        AND u.search_city_name = ${mine.city}
        AND u.search_city_uf IS NOT DISTINCT FROM ${mine.uf}
    ), firsts AS (
      SELECT ${visit.userId} AS user_id, ${key} AS k, min(e.starts_at) AS at
      FROM ${visit}
      JOIN event e ON e.id = ${visit.eventId}
      WHERE e.starts_at >= (${start.toISOString()}::timestamptz AT TIME ZONE 'UTC')
        AND e.starts_at < (${to.toISOString()}::timestamptz AT TIME ZONE 'UTC')
        AND ${visit.userId} IN (SELECT id FROM people)
      GROUP BY 1, 2
    ), scores AS (
      SELECT user_id, count(*) AS value, max(at) AS reached
      FROM firsts GROUP BY user_id
    ), ranked AS (
      SELECT p.id, p.name, p.username,
        coalesce(s.value, 0)::int AS value,
        (row_number() OVER (
          ORDER BY coalesce(s.value, 0) DESC, s.reached ASC NULLS LAST, p.name, p.id
        ))::int AS position,
        (count(*) OVER ())::int AS total
      FROM people p
      LEFT JOIN scores s ON s.user_id = p.id
    )`
  const result = await db.execute<{
    id: string
    name: string
    username: string | null
    value: number
    position: number
    total: number
  }>(sql`
    WITH ${ranked(now)}
    SELECT r.id, r.name, r.username, r.value, r.position, r.total
    FROM ranked r, (SELECT position FROM ranked WHERE id = ${me}) m
    WHERE (r.position > ${cursor} AND r.position <= ${cursor + size})
      OR abs(r.position - m.position) <= ${CITY_AROUND}
    ORDER BY r.position
  `)
  const rows = result.rows.map(({ total, ...row }) => ({
    ...row,
    me: row.id === me
  }))
  const total = result.rows[0]?.total ?? 0
  const position = rows.find((row) => row.me)?.position ?? null
  // "▲ 312 na semana" (A05): a sua posição de uma semana atrás, na mesma
  // lista de hoje. Só na primeira página; no começo do mês, nada, como as
  // setas dos amigos.
  const weekAgo = new Date(now.getTime() - MOVE_WINDOW_MS)
  let weekMove: number | null = null
  if (cursor === 0 && position && weekAgo >= start) {
    const before = await db.execute<{ position: number }>(sql`
      WITH ${ranked(weekAgo)}
      SELECT position FROM ranked WHERE id = ${me}
    `)
    const was = before.rows[0]?.position
    weekMove = was === undefined ? null : was - position
  }
  return {
    listed: true as const,
    city: mine.city,
    ...monthOf(now),
    metric,
    total,
    position,
    weekMove,
    rows: rows.filter(
      (r) => r.position > cursor && r.position <= cursor + size
    ),
    around: position
      ? rows.filter((r) => Math.abs(r.position - position) <= CITY_AROUND)
      : [],
    nextCursor: cursor + size < total ? cursor + size : null
  }
}
