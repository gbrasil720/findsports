import { type SQL, sql } from '@findsports_oficial/db'
import { DEFAULT_EVENT_DURATION_INTERVAL } from '@findsports_oficial/db/event-window'
import { z } from 'zod'

import { declaredAmenityIds, RESERVATIONS_AMENITY_ID } from '../amenities'
import { classicRuleLateral } from '../classics'
import { encodeCursor } from '../keyset-cursor'
import { hasPublicRating, ratingPercentage } from '../rating'
import { utcIso } from '../utc-timestamp'

/**
 * Peças comuns aos dois caminhos de `pubs.search` (ESC-19).
 *
 * A busca tem duas implementações — em camadas e linear — e um interruptor
 * entre elas. Tudo que as duas precisam enxergar igual mora aqui: o formato
 * da entrada, o formato da linha crua, os filtros e a montagem da página.
 *
 * Não é organização por gosto. Filtro duplicado nos dois arquivos divergiria
 * na primeira mudança, e o lado que divergisse seria o de emergência — o que
 * ninguém exercita até o dia em que precisa dele.
 */

/**
 * Quanto um jogo pode durar e ainda aparecer na busca depois de começar.
 *
 * Existe só para o filtro abaixo continuar usando o índice
 * `event_barId_startsAt_idx`: sem um piso em `starts_at`, cada bar candidato
 * varreria o histórico inteiro de jogos. Um dia cobre qualquer transmissão.
 * Teto conhecido: jogo com `ends_at` mais de 24 horas depois do início some da
 * busca na 25ª hora, ainda em andamento. Se isso passar a existir, o caminho é
 * um índice sobre o fim derivado.
 */
const MAX_LIVE_SPAN_INTERVAL = '24 hours'

/**
 * Jogo que ainda não acabou: o próximo ou o que está rolando agora.
 *
 * A busca filtrava `starts_at >= NOW()`. Um bar cujo único jogo tinha começado
 * cinco minutos antes sumia do resultado, e o pino de "ao vivo" só aparecia
 * para quem já estava com a tela aberta. É a mesma regra de fim derivado do
 * perfil público (`@findsports_oficial/db/event-window`).
 */
export const jogoNaoAcabou = (e: SQL) => sql`
  ${e}.starts_at >= NOW() - ${MAX_LIVE_SPAN_INTERVAL}::interval
  AND COALESCE(${e}.ends_at, ${e}.starts_at + ${DEFAULT_EVENT_DURATION_INTERVAL}::interval) >= NOW()`

/**
 * O bar recebe reservas agora: interruptor ligado e Elite vigente. É
 * `receivesReservations` (`../reservation-intake`) em SQL, e o teste de
 * integração do filtro compara as duas.
 *
 * Lê `subscription`, e não `bar.plan`: a projeção só acompanha o relógio uma
 * vez por dia, e um trial vencido seguiria "recebendo" até a reconciliação.
 */
export const recebeReservas = (barAlias: SQL) => sql`(
  ${barAlias}.accepts_reservations
  AND EXISTS (
    SELECT 1 FROM subscription assinatura
    WHERE assinatura.bar_id = ${barAlias}.id
      AND subscription_current_plan(
        assinatura.plan, assinatura.status, assinatura.current_period_end
      ) = 'elite'
  ))`

export type SearchInput = {
  lat: number
  lng: number
  radiusKm: 1 | 3 | 5 | 10
  sportId?: string
  championship?: string
  date?: string
  /** Ids do vocabulário de `../amenities`, já normalizados pelo roteador. */
  amenities?: number[]
  /** Ids de time, já sem repetido e ordenados pelo roteador. */
  teamIds?: string[]
  /**
   * `relevance` é a ordem de sempre — plano, próximo jogo, distância. Só o
   * torcedor pode pedir `rating`, e é nesse pedido explícito que o plano sai
   * da frente.
   */
  sort?: SearchSort
  cursor?: string
  limit: number
}

export type SearchSort = 'relevance' | 'rating'

export type SearchBar = {
  id: string
  name: string
  neighborhood: string
  city: string
  latitude: string
  longitude: string
  photo_url: string | null
  created_at: string
  distance_km: number
  plan: 'starter' | 'pro' | 'elite'
  event_count: number
  /**
   * Nota pública do bar, ou `null` quando ele ainda não tem amostra
   * suficiente. Quem decide é o servidor, com `RATING_PUBLIC_FLOOR` — o
   * cliente nunca recebe contagem parcial para exibir por conta própria.
   */
  rating: { positive: number; total: number; percentage: number } | null
  nextEvent:
    | {
        id: string
        championship: string
        startsAt: string
        /** Fim informado pelo bar, ou `null`: o cliente deriva o padrão. */
        endsAt: string | null
        sport: { name: string; slug: string }
        participants: { team: { name: string; logoUrl: string | null } }[]
        participantFreeText: string | null
        classic: { reason: string; ruleVersion: number } | null
      }
    | undefined
}

export type SearchPage = { bars: SearchBar[]; nextCursor: string | null }

/**
 * Última tupla de relevância: prioridade do clássico Elite, plano, qualidade,
 * próximo jogo, distância e id. `v` invalida cursores emitidos antes da nova
 * regra, evitando continuar uma paginação com uma ordem diferente.
 */
export const searchCursorSchema = z.object({
  v: z.literal(2),
  c: z.number(),
  q: z.number(),
  p: z.number(),
  e: z.string(),
  d: z.number(),
  i: z.string()
})

/** Cursor de relevância emitido antes da prioridade de clássico e qualidade. */
export const legacySearchCursorSchema = z
  .object({
    p: z.number(),
    e: z.string(),
    d: z.number(),
    i: z.string()
  })
  .strict()

/**
 * Cursor do modo "melhor avaliados": grupo (com nota pública ou sem), nota
 * negada, plano, próximo jogo, distância, id.
 *
 * Formato próprio, e deliberadamente incompatível com `searchCursorSchema`:
 * as chaves de ordenação são outras. Trocar de modo no meio da paginação
 * recomeça a lista — continuar de onde parou numa ordem diferente não
 * significa nada, e a validação do cursor recusa o formato errado em vez de
 * paginar torto.
 */
export const ratingCursorSchema = z.object({
  b: z.number(),
  s: z.number(),
  p: z.number(),
  e: z.string(),
  d: z.number(),
  i: z.string()
})

/**
 * Uma linha crua da busca, no formato que os DOIS caminhos produzem.
 *
 * Os caminhos divergem só na forma de chegar às linhas; a partir daqui a
 * leitura é a mesma. Um campo renomeado quebra os dois de uma vez, em vez de
 * deixar o caminho de emergência quebrado esperando o dia em que for ligado.
 */
export type LinhaBusca = {
  id: string
  name: string
  neighborhood: string
  city: string
  latitude: string
  longitude: string
  photo_url: string | null
  created_at: string
  plan: 'starter' | 'pro' | 'elite'
  rating_count?: string | number | null
  rating_positive?: string | number | null
  cursor_bucket?: number
  cursor_sort_score?: number
  cursor_classic_rank?: number
  cursor_quality_rank?: number
  event_count: string | number
  distance_km: number
  cursor_plan_rank: number
  cursor_next_event_at: string
  next_event_id: string | null
  next_championship: string | null
  next_event_starts_at: string | null
  next_event_ends_at: string | null
  next_sport_name: string | null
  next_sport_slug: string | null
  next_participant_free_text: string | null
  next_classic_rule_version: number | string | null
  next_classic_rule_reason: string | null
  next_participants: { name: string; logoUrl: string | null }[]
}

export type FiltrosBusca = {
  /** Ponto de busca como geography, casado com os índices GiST (0013/0018). */
  origin: SQL
  radiusMeters: number
  /**
   * Recortes que só olham o jogo: esporte, data e times (jogo com ao menos
   * um dos escolhidos). Um fragmento só, porque todo lugar que procura jogo
   * aplica os três juntos.
   */
  eventFilter: SQL
  /**
   * Texto do jogo OU nome do bar. O alias da
   * tabela do bar muda conforme a query, então entra como fragmento montado
   * pelo chamador; nunca como texto interpolado.
   */
  champBarFilter: (nomeDoBar: SQL) => SQL
  /**
   * Próximo jogo do bar, com os mesmos recortes que o admitem na busca.
   *
   * Vai sem o `SELECT` para o linear poder pôr a contagem por janela na
   * frente. Um fragmento só, para o jogo exibido não divergir do filtro que
   * trouxe o bar: bar casado pelo nome precisa vir com o próximo jogo dele.
   */
  proximoJogo: (barAlias: SQL) => SQL
  /**
   * Características do bar, com semântica de E: o bar precisa ter todas as
   * marcadas. É o que `@>` faz, e é por isso que ele foi escolhido em vez de
   * uma tabela de junção — ver migration 0021.
   *
   * "Aceita reserva" é a exceção: não é marcada, é derivada do recebimento
   * de fato, como no perfil (`publicAmenityIds`). Pedir essa característica
   * é pedir `recebeReservas`, sem olhar o id em `amenities`; as demais
   * continuam pelo `@>`, e as duas condições somam com E.
   *
   * O alias da tabela do bar muda entre os dois caminhos, então entra como
   * fragmento montado pelo chamador, igual ao filtro de campeonato.
   */
  amenityFilter: (barAlias: SQL) => SQL
}

export function montarFiltrosBusca(input: SearchInput): FiltrosBusca {
  const {
    lat,
    lng,
    radiusKm,
    sportId,
    championship,
    date,
    amenities,
    teamIds
  } = input

  // `search_normalize` (migration 0039) tira acento e caixa dos dois lados,
  // então `gremio` casa com `Grêmio`. Texto de evento montado uma vez só, para
  // os três caminhos compararem as mesmas colunas.
  const padrao = sql`'%' || search_normalize(${championship ?? ''}) || '%'`
  const casa = (coluna: SQL) => sql`search_normalize(${coluna}) LIKE ${padrao}`
  const textoDoJogo = sql`(${casa(sql`e.championship`)}
    OR ${casa(sql`e.participant_free_text`)}
    OR EXISTS (
      SELECT 1 FROM event_participants ep
      JOIN team t ON t.id = ep.team_id
      WHERE ep.event_id = e.id AND ${casa(sql`t.name`)}
    ))`

  // Cada id vai como parâmetro ligado, nunca interpolado no texto do SQL —
  // mesma regra do campeonato, ainda que aqui a entrada já esteja reduzida a
  // números conhecidos pela normalização no roteador.
  const declaradas = declaredAmenityIds(amenities ?? [])
  const listaAmenidades = declaradas.length
    ? sql.join(
        declaradas.map((id) => sql`${id}`),
        sql`, `
      )
    : null

  const eventFilter = sql.join(
    [
      sportId ? sql`AND e.sport_id = ${sportId}` : sql``,
      date ? sql`AND DATE(e.starts_at) = ${date}` : sql``,
      teamIds?.length
        ? sql`AND EXISTS (
              SELECT 1 FROM event_participants ep
              WHERE ep.event_id = e.id
                AND ep.team_id IN (${sql.join(
                  teamIds.map((id) => sql`${id}`),
                  sql`, `
                )})
            )`
        : sql``
    ],
    sql` `
  )
  const champBarFilter = (nomeDoBar: SQL) =>
    championship ? sql`AND (${textoDoJogo} OR ${casa(nomeDoBar)})` : sql``

  return {
    origin: sql`ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography`,
    radiusMeters: radiusKm * 1000,
    eventFilter,
    champBarFilter,
    proximoJogo: (barAlias) => sql`
      e.id AS next_event_id,
      e.championship AS next_championship,
      e.starts_at AS next_event_at,
      e.starts_at AS next_event_starts_at,
      e.ends_at AS next_event_ends_at,
      s.name AS next_sport_name,
      s.slug AS next_sport_slug,
      e.participant_free_text AS next_participant_free_text,
      classic.classic_rule_id,
      classic.classic_rule_version AS next_classic_rule_version,
      classic.classic_rule_reason AS next_classic_rule_reason
      FROM event e
      JOIN sport s ON s.id = e.sport_id
      ${classicRuleLateral(sql`e`)}
      WHERE e.bar_id = ${barAlias}.id
        AND ${jogoNaoAcabou(sql`e`)}
        ${eventFilter}
        ${champBarFilter(sql`${barAlias}.name`)}
      ORDER BY e.starts_at ASC, e.id ASC
      LIMIT 1`,
    amenityFilter: (barAlias) =>
      sql`${
        listaAmenidades
          ? sql`AND ${barAlias}.amenities @> ARRAY[${listaAmenidades}]::int[]`
          : sql``
      } ${
        amenities?.includes(RESERVATIONS_AMENITY_ID)
          ? sql`AND ${recebeReservas(barAlias)}`
          : sql``
      }`
  }
}

export function montarPaginaBusca(
  rows: LinhaBusca[],
  limit: number,
  sort: SearchSort = 'relevance'
): SearchPage {
  const bars: SearchBar[] = rows.map((row) => ({
    id: row.id,
    name: row.name,
    neighborhood: row.neighborhood,
    city: row.city,
    latitude: row.latitude,
    longitude: row.longitude,
    photo_url: row.photo_url,
    created_at: utcIso(row.created_at),
    distance_km: row.distance_km,
    plan: row.plan,
    event_count: Number(row.event_count),
    // O piso é aplicado AQUI, e não na tela: o cliente nunca recebe a
    // contagem de um bar que ainda não tem nota pública, então não tem como
    // exibi-la por engano nem inferi-la.
    rating: (() => {
      const total = Number(row.rating_count ?? 0)
      const positive = Number(row.rating_positive ?? 0)
      if (!hasPublicRating(total)) return null

      return { positive, total, percentage: ratingPercentage(positive, total) }
    })(),
    // `starts_at` é NOT NULL: com `next_event_id` ele sempre vem. Sai como
    // ISO com `Z`, por onde os três caminhos da busca passam — ver `utcIso`.
    nextEvent:
      row.next_event_id && row.next_event_starts_at
        ? {
            id: row.next_event_id,
            championship: row.next_championship ?? '',
            startsAt: utcIso(row.next_event_starts_at),
            endsAt: row.next_event_ends_at
              ? utcIso(row.next_event_ends_at)
              : null,
            sport: {
              name: row.next_sport_name ?? '',
              slug: row.next_sport_slug ?? ''
            },
            participants: row.next_participants.map((p) => ({
              team: { name: p.name, logoUrl: p.logoUrl }
            })),
            participantFreeText: row.next_participant_free_text,
            classic:
              row.next_classic_rule_reason &&
              row.next_classic_rule_version != null
                ? {
                    reason: row.next_classic_rule_reason,
                    ruleVersion: Number(row.next_classic_rule_version)
                  }
                : null
          }
        : undefined
  }))

  const last = rows.length === limit ? rows[rows.length - 1] : undefined

  if (!last) return { bars, nextCursor: null }

  return {
    bars,
    nextCursor: encodeCursor(
      sort === 'rating'
        ? {
            b: Number(last.cursor_bucket),
            s: Number(last.cursor_sort_score),
            p: Number(last.cursor_plan_rank),
            e: last.cursor_next_event_at,
            d: last.distance_km,
            i: last.id
          }
        : {
            v: 2,
            c: Number(last.cursor_classic_rank),
            q: Number(last.cursor_quality_rank),
            p: Number(last.cursor_plan_rank),
            e: last.cursor_next_event_at,
            d: last.distance_km,
            i: last.id
          }
    )
  }
}
