import { db, sql } from '@findsports_oficial/db'

import { decodeCursor } from '../keyset-cursor'
import {
  type LinhaBusca,
  montarFiltrosBusca,
  montarPaginaBusca,
  type SearchInput,
  type SearchPage,
  searchCursorSchema
} from './shared'

/**
 * Caminho de emergência da busca (ESC-19).
 *
 * É a query que existia antes da migration 0018, com um único ajuste: não
 * devolve mais `description` e `address`, que a tela não usa. Ela lê o plano
 * de `subscription` com `LEFT JOIN`, e é exatamente por isso que existe.
 *
 * O caminho em camadas depende de `bar.plan`, uma PROJEÇÃO de
 * `subscription.plan` mantida por trigger. Projeção pode dessincronizar — por
 * escrita que contorne a trigger, por restauração parcial, por uma migration
 * futura que mexa em `subscription` de um jeito que a trigger não cubra. E o
 * sintoma é o pior possível: um bar pago aparece na camada errada, sem erro,
 * sem log, sem teste de tipo reclamando. Quem descobre é o cliente.
 *
 * Aqui o plano vem da fonte da verdade a cada consulta, então a dessincronia
 * simplesmente não existe. O preço é o que a 0018 mediu: 24 ms e 44.363
 * buffers contra 5,5 ms e 1.355, no dataset grande. Caro o bastante para não
 * ser o padrão, barato o bastante para segurar o site enquanto a projeção é
 * reconstruída.
 *
 * A ordem, os filtros e o formato do cursor são os mesmos dos dois lados —
 * incluindo o `cursor_plan_rank`, que é o mesmo número. Um cursor emitido por
 * um caminho continua válido no outro, o que importa porque a troca acontece
 * com gente no meio da paginação.
 */
export async function executarBuscaLinear(
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

  const champBarFilterN = champBarFilter(sql`n.name`)
  const amenityFilterB = amenityFilter(sql`b`)

  const planRankSql = sql`CASE n.plan WHEN 'elite' THEN 1 WHEN 'pro' THEN 2 ELSE 3 END`
  const keyset = cursor ? decodeCursor(cursor, searchCursorSchema) : null
  const keysetFilter = keyset
    ? sql`WHERE (${planRankSql}, agg.next_event_at, n.distance_km, n.id) >
          (${keyset.p}::int, ${keyset.e}::timestamp, ${keyset.d}::float8, ${keyset.i}::text)`
    : sql``

  const results = await db.execute(sql`
    WITH nearby AS (
      SELECT
        b.id,
        b.name,
        b.neighborhood,
        b.city,
        b.latitude,
        b.longitude,
        b.photo_url,
        b.created_at,
        b.rating_count,
        b.rating_positive,
        COALESCE(s.plan, 'starter') AS plan,
        ST_Distance(b.geo, ${origin}) / 1000 AS distance_km
      FROM bar b
      LEFT JOIN subscription s ON s.bar_id = b.id
      WHERE b.is_active
        AND ST_DWithin(b.geo, ${origin}, ${radiusMeters})
        ${amenityFilterB}
    )
    SELECT
      n.*,
      agg.event_count,
      ${planRankSql} AS cursor_plan_rank,
      to_char(agg.next_event_at, 'YYYY-MM-DD HH24:MI:SS.US') AS cursor_next_event_at,
      nxt.next_event_id,
      nxt.next_championship,
      nxt.next_event_starts_at,
      nxt.next_sport_name,
      nxt.next_sport_slug,
      nxt.next_participant_free_text,
      COALESCE(parts.next_participants, '[]'::json) AS next_participants
    FROM nearby n
    JOIN LATERAL (
      SELECT COUNT(*)::int AS event_count, MIN(e.starts_at) AS next_event_at
      FROM event e
      WHERE e.bar_id = n.id
        AND e.starts_at >= NOW()
        ${sportFilter}
        ${champBarFilterN}
        ${dateFilter}
    ) agg ON agg.event_count > 0
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
      WHERE e.bar_id = n.id
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
    ${keysetFilter}
    ORDER BY
      ${planRankSql} ASC,
      agg.next_event_at ASC,
      n.distance_km ASC,
      n.id ASC
    LIMIT ${limit}
  `)

  return montarPaginaBusca(results.rows as LinhaBusca[], limit)
}
