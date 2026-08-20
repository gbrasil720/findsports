import { type SQL, sql } from 'drizzle-orm'
import { z } from 'zod'

import { encodeCursor } from '../keyset-cursor'

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

export type SearchInput = {
  lat: number
  lng: number
  radiusKm: 1 | 3 | 5 | 10
  sportId?: string
  championship?: string
  date?: string
  /** Ids do vocabulário de `../amenities`, já normalizados pelo roteador. */
  amenities?: number[]
  cursor?: string
  limit: number
}

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
  nextEvent:
    | {
        id: string
        championship: string
        startsAt: string
        sport: { name: string; slug: string }
        participants: { team: { name: string; logoUrl: string | null } }[]
        participantFreeText: string | null
      }
    | undefined
}

export type SearchPage = { bars: SearchBar[]; nextCursor: string | null }

/** Última tupla de ordenação: plano, próximo jogo, distância, id. */
export const searchCursorSchema = z.object({
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
  event_count: string | number
  distance_km: number
  cursor_plan_rank: number
  cursor_next_event_at: string
  next_event_id: string | null
  next_championship: string | null
  next_event_starts_at: string | null
  next_sport_name: string | null
  next_sport_slug: string | null
  next_participant_free_text: string | null
  next_participants: { name: string; logoUrl: string | null }[]
}

export type FiltrosBusca = {
  /** Ponto de busca como geography, casado com os índices GiST (0013/0018). */
  origin: SQL
  radiusMeters: number
  sportFilter: SQL
  /** Só o campeonato do jogo. */
  champFilter: SQL
  dateFilter: SQL
  /**
   * Campeonato OU nome do bar — comportamento original da busca. O alias da
   * tabela do bar muda conforme a query, então entra como fragmento montado
   * pelo chamador; nunca como texto interpolado.
   */
  champBarFilter: (nomeDoBar: SQL) => SQL
  /**
   * Características do bar, com semântica de E: o bar precisa ter todas as
   * marcadas. É o que `@>` faz, e é por isso que ele foi escolhido em vez de
   * uma tabela de junção — ver migration 0021.
   *
   * O alias da tabela do bar muda entre os dois caminhos, então entra como
   * fragmento montado pelo chamador, igual ao filtro de campeonato.
   */
  amenityFilter: (barAlias: SQL) => SQL
}

export function montarFiltrosBusca(input: SearchInput): FiltrosBusca {
  const { lat, lng, radiusKm, sportId, championship, date, amenities } = input

  const padraoCampeonato = championship ? `%${championship.toLowerCase()}%` : ''

  // Cada id vai como parâmetro ligado, nunca interpolado no texto do SQL —
  // mesma regra do campeonato, ainda que aqui a entrada já esteja reduzida a
  // números conhecidos pela normalização no roteador.
  const listaAmenidades = amenities?.length
    ? sql.join(
        amenities.map((id) => sql`${id}`),
        sql`, `
      )
    : null

  return {
    origin: sql`ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography`,
    radiusMeters: radiusKm * 1000,
    sportFilter: sportId ? sql`AND e.sport_id = ${sportId}` : sql``,
    champFilter: championship
      ? sql`AND LOWER(e.championship) LIKE ${padraoCampeonato}`
      : sql``,
    dateFilter: date ? sql`AND DATE(e.starts_at) = ${date}` : sql``,
    champBarFilter: (nomeDoBar) =>
      championship
        ? sql`AND (LOWER(e.championship) LIKE ${padraoCampeonato} OR LOWER(${nomeDoBar}) LIKE ${padraoCampeonato})`
        : sql``,
    amenityFilter: (barAlias) =>
      listaAmenidades
        ? sql`AND ${barAlias}.amenities @> ARRAY[${listaAmenidades}]::int[]`
        : sql``
  }
}

export function montarPaginaBusca(
  rows: LinhaBusca[],
  limit: number
): SearchPage {
  const bars: SearchBar[] = rows.map((row) => ({
    id: row.id,
    name: row.name,
    neighborhood: row.neighborhood,
    city: row.city,
    latitude: row.latitude,
    longitude: row.longitude,
    photo_url: row.photo_url,
    created_at: row.created_at,
    distance_km: row.distance_km,
    plan: row.plan,
    event_count: Number(row.event_count),
    nextEvent: row.next_event_id
      ? {
          id: row.next_event_id,
          championship: row.next_championship ?? '',
          startsAt: row.next_event_starts_at ?? '',
          sport: {
            name: row.next_sport_name ?? '',
            slug: row.next_sport_slug ?? ''
          },
          participants: row.next_participants.map((p) => ({
            team: { name: p.name, logoUrl: p.logoUrl }
          })),
          participantFreeText: row.next_participant_free_text
        }
      : undefined
  }))

  const last = rows.length === limit ? rows[rows.length - 1] : undefined

  return {
    bars,
    nextCursor: last
      ? encodeCursor({
          p: Number(last.cursor_plan_rank),
          e: last.cursor_next_event_at,
          d: last.distance_km,
          i: last.id
        })
      : null
  }
}
