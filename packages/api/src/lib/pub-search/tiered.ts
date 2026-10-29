import { db, sql } from '@findsports_oficial/db'

import { currentClassicRulesCte } from '../classics'
import { participantTeams } from '../game-participants'
import { decodeCursor } from '../keyset-cursor'
import { RATING_PUBLIC_FLOOR } from '../rating'
import {
  jogoNaoAcabou,
  type LinhaBusca,
  legacySearchCursorSchema,
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
  { rank: 1, plan: sql`'elite'`, cte: sql`camada_elite` },
  { rank: 2, plan: sql`'pro'`, cte: sql`camada_pro` },
  { rank: 3, plan: sql`'starter'`, cte: sql`camada_starter` }
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
 * chave de ordenação, então cada camada é um CTE com o seu próprio LIMIT, e
 * uma camada só roda se as anteriores não encheram a página. No dataset
 * grande a camada `elite` (5% dos bares, ~300 candidatos no raio) resolve
 * sozinha as buscas sem filtro.
 *
 * A trava é a condição `count(anteriores) < limit` de cada camada, e não a
 * ordem em que o `Append` de um `UNION ALL` lê os filhos: o SQL não promete
 * essa ordem, e o `ORDER BY` que o ranking de clássicos (08/09) pôs por fora
 * para garanti-la fazia o `Sort` ler as três camadas até o fim em toda busca.
 * Com a trava, o `ORDER BY` de fora ordena no máximo 3 × limit linhas.
 *
 * Medido em 29/10/2026 (Postgres 17, mediana de 7), raio de 3 km em
 * (-23,55, -46,63), 6.100 bares no raio (300 elite, 1.000 pro, 4.800
 * starter): sem filtro, 3,5 ms / 2.154 buffers (com o `Sort` sobre as três
 * camadas eram 53 ms / 39.134); com um campeonato comum, 5,9 ms / 2.556 (eram
 * 79 ms / 47.215). Mesmas páginas da versão anterior, 40 páginas pelo cursor,
 * inclusive as que cruzam de camada. O caminho linear, na mesma busca sem
 * filtro, fica em 143 ms / 86.323.
 *
 * Texto que quase nada casa faz as três camadas rodarem, e cada bar no raio
 * custava uma ida ao índice de `event` (57 ms). A camada starter (80% dos
 * bares) agora parte dos jogos que casam (`texto_jogos`, índice trigram):
 * 21 ms. Elite e pro continuam bar a bar: com `texto_jogos` também na pro o
 * texto raro ia a 11 ms, mas texto comum, que enche o teto, pagava a lista
 * inteira do índice nas páginas da pro (da 12ª em diante: 18 para 54 ms).
 * Texto comum na primeira página: 3,7 a 5,6 ms, como antes. Medido sem JIT
 * (migration 0084): com ele, a compilação sozinha levava 121 ms.
 *
 * Para medir: em `packages/db`, `NODE_ENV=test bun run db:seed:load-test
 * --bars 100000` (100 mil bares, 500 mil jogos; só aceita o
 * `findsports_load_test`, ver AGENTS.md) e
 * `EXPLAIN (ANALYZE, BUFFERS)` da consulta que `executarBuscaEmCamadas`
 * manda para `{ lat: -23.55, lng: -46.63, radiusKm: 3, limit: 20 }`;
 * buffers são `shared hit + read` do nó de cima.
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
    eventFilter,
    champBarFilter,
    proximoJogo,
    textoJogosCte,
    prefiltroTexto,
    amenityFilter
  } = montarFiltrosBusca(input)

  const champBarFilterR = champBarFilter(sql`r.name`)
  const amenityFilterB = amenityFilter(sql`b`)

  const keyset = cursor
    ? decodeCursor(cursor, searchCursorSchema, {
        restartOn: legacySearchCursorSchema
      })
    : null

  // Cursor apontando para um plano que não existe mais (ou forjado): acabou a
  // paginação. Sem isso a lista de camadas ficaria vazia e o UNION ALL sairia
  // sem nenhum SELECT.
  if (keyset && !PLAN_TIERS.some((tier) => tier.rank >= keyset.p)) {
    return { bars: [], nextCursor: null }
  }

  // Uma camada por plano, na mesma ordem em que a query ordenava. Os literais
  // vêm desta lista fixa, nunca da entrada do usuário: precisam ser constantes
  // para o Postgres casar o índice parcial `bar_geo_<plano>_idx`.
  const included = PLAN_TIERS.filter((tier) => !keyset || tier.rank >= keyset.p)
  const tiers = included.map((tier, index) => {
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

    // A camada só roda se as anteriores não encheram a página. Sem coluna da
    // linha, a condição vira um `One-Time Filter` no topo do plano: falsa, a
    // camada não lê nem o índice.
    const earlier = included.slice(0, index)
    const gate = earlier.length
      ? sql`AND ${sql.join(
          earlier.map((prev) => sql`(SELECT count(*) FROM ${prev.cte})`),
          sql` + `
        )} < ${limit}`
      : sql``

    return sql`${tier.cte} AS MATERIALIZED (
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
        agg.next_event_ends_at,
        agg.next_sport_name,
        agg.next_sport_slug,
        agg.next_participant_free_text,
        agg.next_classic_rule_version,
        agg.next_classic_rule_reason,
        agg.next_on_big_screen,
        agg.next_with_sound
      FROM bar b
      JOIN LATERAL (
        SELECT ${proximoJogo(sql`b`)}
      ) agg ON agg.next_event_at IS NOT NULL
      WHERE b.is_active
        AND b.plan = ${tier.plan}
        AND ST_DWithin(b.geo, ${origin}, ${radiusMeters})
        ${amenityFilterB}
        ${
          // Só na starter: ver o comentário do topo.
          tier.rank === 3 ? prefiltroTexto(sql`b`) : sql``
        }
        ${tierKeyset}
        ${gate}
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
    WITH ${sql.join(
      [
        currentClassicRulesCte,
        ...(textoJogosCte ? [textoJogosCte] : []),
        ...tiers
      ],
      sql`, `
    )},
    ranked AS MATERIALIZED (
      SELECT * FROM (
        ${sql.join(
          included.map((tier) => sql`SELECT * FROM ${tier.cte}`),
          sql` UNION ALL `
        )}
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
      ${participantTeams(sql`r.next_event_id`)} AS next_participants
    FROM ranked r
    JOIN LATERAL (
      SELECT COUNT(*)::int AS event_count
      FROM event e
      WHERE e.bar_id = r.id
        AND ${jogoNaoAcabou(sql`e`)}
        ${eventFilter}
        ${champBarFilterR}
    ) cnt ON true
  `)

  return montarPaginaBusca(results.rows as LinhaBusca[], limit)
}
