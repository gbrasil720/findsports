import { db, sql } from '@findsports_oficial/db'

import { classicRuleLateral, currentClassicRulesCte } from '../classics'
import { decodeCursor } from '../keyset-cursor'
import { RATING_PUBLIC_FLOOR } from '../rating'
import {
  type LinhaBusca,
  montarFiltrosBusca,
  montarPaginaBusca,
  type SearchInput,
  type SearchPage,
  searchCursorSchema
} from './shared'

/**
 * Camadas de plano, na ordem em que a busca ordena. `rank` é o mesmo número
 * que o cursor grava, então cursores emitidos por qualquer um dos dois
 * caminhos continuam válidos no outro.
 */
const PLAN_TIERS = [
  { rank: 1, plan: sql`'elite'` },
  { rank: 2, plan: sql`'pro'` },
  { rank: 3, plan: sql`'starter'` }
] as const

/**
 * A busca calculava COUNT, próximo jogo e participantes via LATERAL para
 * cada bar no raio — no dataset grande, 6.100 vezes — e só então aplicava
 * LIMIT 20. `ranked AS MATERIALIZED` já tinha tirado COUNT/detalhe/times de
 * dentro do ranking; sobravam dois lookups por candidato, que somavam 96%
 * dos buffers do plano:
 *
 *   - `LEFT JOIN subscription` para descobrir o plano — 24.401 buffers
 *   - `MIN(starts_at)` do próximo jogo                — 18.304 buffers
 *
 * O primeiro morreu com `bar.plan` (projeção mantida por trigger, migration
 * 0018). O segundo encolheu com avaliação em camadas: o plano é a primeira
 * chave de ordenação, então cada camada é uma subquery com o seu próprio
 * LIMIT e o `Append` só desce para a camada seguinte se a anterior não
 * encheu a página. No dataset grande a camada `elite` (5% dos bares, ~300
 * candidatos no raio) resolve sozinha as buscas sem filtro.
 *
 * Medido no harness local, raio de 3 km em São Paulo, 6.100 bares no raio:
 * 24 ms / 44.363 buffers antes, 5,5 ms / 1.355 buffers depois. No pior caso
 * — filtro que não casa com nada, obrigando as três camadas a varrer tudo —
 * ficou em 23 ms, ou seja, empata com o plano antigo em vez de regredir.
 *
 * Preserva os mesmos filtros e a troca segura para o caminho linear; o cursor
 * de relevância agora é v2 porque inclui clássico e qualidade. Campeonato
 * ainda casa pelo nome do bar na qualificação e no próximo jogo selecionado.
 */
export async function executarBuscaEmCamadas(
  input: SearchInput
): Promise<SearchPage> {
  const { cursor, limit } = input
  const {
    origin,
    radiusMeters,
    sportFilter,
    dateFilter,
    champBarFilter,
    amenityFilter
  } = montarFiltrosBusca(input)

  const champBarFilterB = champBarFilter(sql`b.name`)
  const champBarFilterR = champBarFilter(sql`r.name`)
  const amenityFilterB = amenityFilter(sql`b`)

  const keyset = cursor ? decodeCursor(cursor, searchCursorSchema) : null

  // Cursor apontando para um plano que não existe mais (ou forjado): acabou a
  // paginação. Sem isso a lista de camadas ficaria vazia e o UNION ALL sairia
  // sem nenhum SELECT.
  if (keyset && !PLAN_TIERS.some((tier) => tier.rank >= keyset.p)) {
    return { bars: [], nextCursor: null }
  }

  // Uma camada por plano, na mesma ordem em que a query ordenava. Os literais
  // vêm desta lista fixa, nunca da entrada do usuário: precisam ser constantes
  // para o Postgres casar o índice parcial `bar_geo_<plano>_idx`.
  const tiers = PLAN_TIERS.filter(
    (tier) => !keyset || tier.rank >= keyset.p
  ).map((tier) => {
    const classicRank =
      tier.rank === 1
        ? sql`CASE WHEN agg.classic_rule_id IS NULL THEN 1 ELSE 0 END`
        : sql`1`
    const qualityRank = sql`CASE
      WHEN b.rating_count >= ${RATING_PUBLIC_FLOOR} THEN -b.rating_score
      ELSE 0
    END`

    // Só a camada onde o cursor parou continua de onde parou. As seguintes
    // começam do zero, porque toda linha delas já é maior na primeira chave.
    const tierKeyset =
      keyset && tier.rank === keyset.p
        ? sql`AND (${classicRank}, ${qualityRank}, agg.next_event_at,
                   ST_Distance(b.geo, ${origin}) / 1000, b.id) >
                (${keyset.c}::int, ${keyset.q}::float8, ${keyset.e}::timestamp,
                 ${keyset.d}::float8, ${keyset.i}::text)`
        : sql``

    return sql`(
      SELECT
        ${tier.rank}::int AS cursor_plan_rank,
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
        ${classicRank} AS cursor_classic_rank,
        ${qualityRank} AS cursor_quality_rank,
        ST_Distance(b.geo, ${origin}) / 1000 AS distance_km,
        to_char(agg.next_event_at, 'YYYY-MM-DD HH24:MI:SS.US') AS cursor_next_event_at,
        agg.next_event_id,
        agg.next_championship,
        agg.next_event_starts_at,
        agg.next_sport_name,
        agg.next_sport_slug,
        agg.next_participant_free_text,
        agg.next_classic_rule_version,
        agg.next_classic_rule_reason
      FROM bar b
      JOIN LATERAL (
        SELECT
          e.id AS next_event_id,
          e.championship AS next_championship,
          e.starts_at AS next_event_at,
          e.starts_at AS next_event_starts_at,
          s.name AS next_sport_name,
          s.slug AS next_sport_slug,
          e.participant_free_text AS next_participant_free_text,
          classic.classic_rule_version AS next_classic_rule_version,
          classic.classic_rule_reason AS next_classic_rule_reason,
          classic.classic_rule_id
        FROM event e
        JOIN sport s ON s.id = e.sport_id
        ${classicRuleLateral(sql`e`)}
        WHERE e.bar_id = b.id
          AND e.starts_at >= NOW()
          ${sportFilter}
          ${champBarFilterB}
          ${dateFilter}
        ORDER BY e.starts_at ASC, e.id ASC
        LIMIT 1
      ) agg ON agg.next_event_at IS NOT NULL
      WHERE b.is_active
        AND b.plan = ${tier.plan}
        AND ST_DWithin(b.geo, ${origin}, ${radiusMeters})
        ${amenityFilterB}
        ${tierKeyset}
      ORDER BY
        ${classicRank} ASC,
        ${qualityRank} ASC,
        agg.next_event_at ASC,
        distance_km ASC,
        b.id ASC
      LIMIT ${limit}
    )`
  })

  const results = await db.execute(sql`
    WITH ${currentClassicRulesCte}, ranked AS MATERIALIZED (
      SELECT * FROM (
        ${sql.join(tiers, sql` UNION ALL `)}
      ) tiers
      ORDER BY
        cursor_plan_rank,
        cursor_classic_rank,
        cursor_quality_rank,
        cursor_next_event_at,
        distance_km,
        id
      LIMIT ${limit}
    )
    SELECT
      r.*,
      cnt.event_count,
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
      SELECT json_agg(json_build_object('name', t.name, 'logoUrl', t.logo_url)) AS next_participants
      FROM event_participants ep
      JOIN team t ON t.id = ep.team_id
      WHERE ep.event_id = r.next_event_id
    ) parts ON true
  `)

  return montarPaginaBusca(results.rows as LinhaBusca[], limit)
}
