import { db, sql } from '@findsports_oficial/db'

import { decodeCursor } from '../keyset-cursor'
import { RATING_PUBLIC_FLOOR } from '../rating'
import {
  type LinhaBusca,
  montarFiltrosBusca,
  montarPaginaBusca,
  ratingCursorSchema,
  type SearchInput,
  type SearchPage
} from './shared'

/**
 * Modo "melhor avaliados".
 *
 * Não é a ordem padrão, e isso é decisão de produto, não de engenharia: a
 * ordem padrão coloca o plano na frente porque o plano é o que o bar paga.
 * Aqui o torcedor pediu explicitamente para ver por nota, então o plano sai
 * da frente — mas só neste modo, e só porque ele pediu.
 *
 * Duas coisas que a ordenação precisa resolver e que não são óbvias:
 *
 *   1. **Bar sem nota pública não some.** Ele vem depois de todos os
 *      avaliados, na ordem de sempre. Excluí-lo seria mais simples e
 *      esconderia quase o catálogo inteiro enquanto a base é pequena — o
 *      modo nasceria inútil.
 *
 *   2. **A nota é o Wilson, não a média.** Vem pronta de `bar.rating_score`,
 *      coluna gerada. Ordenar por média crua colocaria o bar de uma
 *      avaliação positiva na frente do bar de quarenta com 85%.
 *
 * O cursor tem formato próprio (`ratingCursorSchema`) e NÃO é intercambiável
 * com o dos outros dois caminhos: as chaves de ordenação são outras. Trocar
 * de modo no meio da paginação recomeça a lista, que é o comportamento certo
 * — continuar de onde parou em outra ordem não significa nada.
 */
export async function executarBuscaPorNota(
  input: SearchInput
): Promise<SearchPage> {
  const { cursor, limit } = input
  const {
    origin,
    radiusMeters,
    sportFilter,
    champFilter,
    dateFilter,
    champBarFilter,
    amenityFilter
  } = montarFiltrosBusca(input)

  const champBarFilterB = champBarFilter(sql`b.name`)
  const champBarFilterR = champBarFilter(sql`r.name`)
  const amenityFilterB = amenityFilter(sql`b`)

  const keyset = cursor ? decodeCursor(cursor, ratingCursorSchema) : null

  // `bucket` separa quem tem nota pública de quem não tem; `sort_score` é o
  // Wilson NEGADO. A negação existe para que todas as chaves fiquem
  // ascendentes e a paginação possa usar comparação de tupla — com uma chave
  // descendente no meio, `(a, b, c) > (x, y, z)` deixaria de valer e o
  // cursor precisaria virar uma cadeia de OR aninhados.
  const bucket = sql`CASE WHEN b.rating_count >= ${RATING_PUBLIC_FLOOR} THEN 0 ELSE 1 END`
  const sortScore = sql`CASE WHEN b.rating_count >= ${RATING_PUBLIC_FLOOR} THEN -b.rating_score ELSE 0 END`
  const planRank = sql`CASE b.plan WHEN 'elite' THEN 1 WHEN 'pro' THEN 2 ELSE 3 END`

  const keysetFilter = keyset
    ? sql`AND (${bucket}, ${sortScore}, ${planRank}, agg.next_event_at, ST_Distance(b.geo, ${origin}) / 1000, b.id) >
          (${keyset.b}::int, ${keyset.s}::float8, ${keyset.p}::int, ${keyset.e}::timestamp, ${keyset.d}::float8, ${keyset.i}::text)`
    : sql``

  const results = await db.execute(sql`
    WITH ranked AS MATERIALIZED (
      SELECT
        b.id,
        b.name,
        b.neighborhood,
        b.city,
        b.latitude,
        b.longitude,
        b.photo_url,
        b.created_at,
        b.plan,
        b.rating_count,
        b.rating_positive,
        ${bucket} AS cursor_bucket,
        ${sortScore} AS cursor_sort_score,
        ${planRank} AS cursor_plan_rank,
        ST_Distance(b.geo, ${origin}) / 1000 AS distance_km,
        to_char(agg.next_event_at, 'YYYY-MM-DD HH24:MI:SS.US') AS cursor_next_event_at
      FROM bar b
      JOIN LATERAL (
        SELECT MIN(e.starts_at) AS next_event_at
        FROM event e
        WHERE e.bar_id = b.id
          AND e.starts_at >= NOW()
          ${sportFilter}
          ${champBarFilterB}
          ${dateFilter}
      ) agg ON agg.next_event_at IS NOT NULL
      WHERE b.is_active
        AND ST_DWithin(b.geo, ${origin}, ${radiusMeters})
        ${amenityFilterB}
        ${keysetFilter}
      ORDER BY
        ${bucket} ASC,
        ${sortScore} ASC,
        ${planRank} ASC,
        agg.next_event_at ASC,
        distance_km ASC,
        b.id ASC
      LIMIT ${limit}
    )
    SELECT
      r.*,
      cnt.event_count,
      nxt.next_event_id,
      nxt.next_championship,
      nxt.next_event_starts_at,
      nxt.next_sport_name,
      nxt.next_sport_slug,
      nxt.next_participant_free_text,
      COALESCE(parts.next_participants, '[]'::json) AS next_participants
    FROM ranked r
    JOIN LATERAL (
      SELECT COUNT(*)::int AS event_count
      FROM event e
      WHERE e.bar_id = r.id
        AND e.starts_at >= NOW()
        ${sportFilter}
        ${champBarFilterR}
        ${dateFilter}
    ) cnt ON true
    LEFT JOIN LATERAL (
      SELECT
        e.id AS next_event_id,
        e.championship AS next_championship,
        e.starts_at AS next_event_starts_at,
        s.name AS next_sport_name,
        s.slug AS next_sport_slug,
        e.participant_free_text AS next_participant_free_text
      FROM event e
      JOIN sport s ON s.id = e.sport_id
      WHERE e.bar_id = r.id
        AND e.starts_at >= NOW()
        ${sportFilter}
        ${champFilter}
        ${dateFilter}
      ORDER BY e.starts_at ASC
      LIMIT 1
    ) nxt ON true
    LEFT JOIN LATERAL (
      SELECT json_agg(json_build_object('name', t.name, 'logoUrl', t.logo_url)) AS next_participants
      FROM event_participants ep
      JOIN team t ON t.id = ep.team_id
      WHERE ep.event_id = nxt.next_event_id
    ) parts ON true
    ORDER BY
      r.cursor_bucket ASC,
      r.cursor_sort_score ASC,
      r.cursor_plan_rank ASC,
      r.cursor_next_event_at ASC,
      r.distance_km ASC,
      r.id ASC
  `)

  return montarPaginaBusca(results.rows as LinhaBusca[], limit, 'rating')
}
