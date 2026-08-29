/**
 * Vocabulário de características do bar.
 *
 * Mora em código, não em tabela. O que uma característica carrega — rótulo,
 * grupo, ordem de exibição — é conteúdo de tela, e já teria que existir no
 * bundle de qualquer forma; uma tabela obrigaria a buscar no banco um rótulo
 * que o cliente já tem. A integridade referencial que a tabela compraria não
 * se aplica a elemento de array no Postgres, então ela não sobraria nem isso.
 *
 * Preço: adicionar característica exige deploy. Com uma dúzia de itens que
 * mudam uma vez por semestre, é barato.
 *
 * REGRA QUE NÃO PODE SER QUEBRADA: `id` nunca é reusado. Os ids estão
 * gravados na coluna `bar.amenities` de todo bar cadastrado — reciclar um id
 * aposentado renomeia silenciosamente o que os bares já declararam. Para
 * remover uma característica, tire-a desta lista e nunca mais use o número.
 */

export const AMENITY_GROUPS = [
  { key: 'watch', label: 'Para ver o jogo' },
  { key: 'space', label: 'O espaço' },
  { key: 'practical', label: 'Chegar e ficar' }
] as const

export type AmenityGroupKey = (typeof AMENITY_GROUPS)[number]['key']

export type Amenity = {
  id: number
  slug: string
  label: string
  group: AmenityGroupKey
}

export const AMENITIES: readonly Amenity[] = [
  {
    id: 1,
    slug: 'screen_projector',
    label: 'Telão / projetor',
    group: 'watch'
  },
  { id: 2, slug: 'match_audio', label: 'Som do jogo ligado', group: 'watch' },
  {
    id: 3,
    slug: 'closed_channel',
    label: 'Premiere / canais fechados',
    group: 'watch'
  },
  { id: 4, slug: 'outdoor_area', label: 'Área externa', group: 'space' },
  { id: 5, slug: 'covered_area', label: 'Área coberta', group: 'space' },
  { id: 6, slug: 'accessible', label: 'Acessível', group: 'space' },
  { id: 7, slug: 'pet_friendly', label: 'Pet friendly', group: 'space' },
  {
    id: 8,
    slug: 'parking_onsite',
    label: 'Estacionamento no local',
    group: 'practical'
  },
  {
    id: 9,
    slug: 'parking_nearby',
    label: 'Estacionamento próximo',
    group: 'practical'
  },
  { id: 10, slug: 'reservations', label: 'Aceita reserva', group: 'practical' },
  {
    id: 11,
    slug: 'late_kitchen',
    label: 'Cozinha até tarde',
    group: 'practical'
  }
] as const

/** Quantas características a busca aceita de uma vez. */
export const MAX_AMENITY_FILTER = 6

/** Máximo de telas que o bar pode declarar. Acima disso é erro de digitação. */
export const MAX_SCREEN_COUNT = 99

const BY_ID = new Map(AMENITIES.map((amenity) => [amenity.id, amenity]))

export function findAmenity(id: number): Amenity | undefined {
  return BY_ID.get(id)
}

/**
 * Normaliza a lista que veio do cliente: descarta id desconhecido (ou
 * aposentado), remove repetido e ordena.
 *
 * A ordenação não é estética — a lista entra na chave do cache da busca, e
 * `[1,4]` e `[4,1]` são o mesmo filtro. Sem ordenar, seriam duas entradas
 * para o mesmo resultado.
 */
export function normalizeAmenityIds(ids: readonly number[]): number[] {
  return [...new Set(ids.filter((id) => BY_ID.has(id)))].sort((a, b) => a - b)
}

export function amenitiesByGroup(ids: readonly number[]) {
  const selected = new Set(ids)

  return AMENITY_GROUPS.map((group) => ({
    ...group,
    amenities: AMENITIES.filter(
      (amenity) => amenity.group === group.key && selected.has(amenity.id)
    )
  })).filter((group) => group.amenities.length > 0)
}
