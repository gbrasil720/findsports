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
 * remover uma característica, tire-a desta lista e nunca mais use o número;
 * se os bares devem guardá-la, ela vai para `HIDDEN_AMENITY_IDS`.
 */

export const AMENITY_GROUPS = [
  { key: 'watch', label: 'Para ver o jogo' },
  { key: 'space', label: 'O espaço' },
  { key: 'food', label: 'Comida e bebida' },
  { key: 'payment', label: 'Pagamento' },
  { key: 'practical', label: 'Para chegar' }
] as const

export type AmenityGroupKey = (typeof AMENITY_GROUPS)[number]['key']

export type Amenity = {
  id: number
  slug: string
  label: string
  group: AmenityGroupKey
}

/*
 * Grupos e ordem são os do design (2c, 4p). O que existe e o design não
 * mostra vai no fim do grupo que faz sentido (WEB-455): Wi-fi em "O espaço",
 * Estacionamento no local em "Para chegar" e "Com oferta da casa", que não se
 * marca, em "Comida e bebida".
 */
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
  { id: 15, slug: 'wifi', label: 'Wi-fi', group: 'space' },
  // A posição na lista é a ordem de exibição; o id só cresce.
  { id: 13, slug: 'draft_beer', label: 'Chopp', group: 'food' },
  { id: 12, slug: 'snacks', label: 'Petiscos', group: 'food' },
  {
    id: 11,
    slug: 'late_kitchen',
    label: 'Cozinha até tarde',
    group: 'food'
  },
  { id: 20, slug: 'vegetarian', label: 'Opção vegetariana', group: 'food' },
  { id: 21, slug: 'drinks', label: 'Drinks', group: 'food' },
  {
    id: 10,
    slug: 'house_offer',
    label: 'Com oferta da casa',
    group: 'food'
  },
  { id: 16, slug: 'pix', label: 'Pix', group: 'payment' },
  { id: 17, slug: 'card', label: 'Cartão', group: 'payment' },
  { id: 18, slug: 'meal_voucher', label: 'Vale-refeição', group: 'payment' },
  // "Cobra couvert": é informação, e o filtro traz quem cobra (dono, 24/10/2026).
  { id: 19, slug: 'cover_charge', label: 'Couvert', group: 'payment' },
  {
    id: 9,
    slug: 'parking_nearby',
    label: 'Estacionamento próximo',
    group: 'practical'
  },
  { id: 22, slug: 'near_subway', label: 'Perto do metrô', group: 'practical' },
  { id: 23, slug: 'bike_rack', label: 'Bicicletário', group: 'practical' },
  {
    id: 8,
    slug: 'parking_onsite',
    label: 'Estacionamento no local',
    group: 'practical'
  }
] as const

/**
 * Ids que os bares ainda têm gravados e nenhuma tela mostra. A busca e a
 * escrita os aceitam (o bar não perde o que tinha ao salvar), mas eles não
 * estão em `AMENITIES`, então não aparecem em checklist, página nem filtro.
 *
 * 14 era "Pix e cartão": virou Pix (16) e Cartão (17), e a migration 0073 deu
 * os dois a quem o tinha marcado (WEB-455). O 14 continua gravado, escondido.
 */
export const HIDDEN_AMENITY_IDS: readonly number[] = [14]

/** Quantas características a busca aceita de uma vez. */
export const MAX_AMENITY_FILTER = 6

/** Máximo de telas que o bar pode declarar. Acima disso é erro de digitação. */
export const MAX_SCREEN_COUNT = 99

/**
 * O que está errado na contagem de telas, pronto para mostrar ao dono do bar,
 * ou `null` quando serve. Vazio serve: o campo é opcional.
 *
 * É a faixa do zod de `onboarding.completePub` e `pub.updateMe`; o formulário
 * confere com esta função em vez de arredondar ou limitar o que foi digitado
 * (WEB-280).
 */
export function motivoTelasInvalido(
  telas: number | null | undefined
): string | null {
  if (telas == null) return null
  return Number.isInteger(telas) && telas >= 0 && telas <= MAX_SCREEN_COUNT
    ? null
    : `Informe um número inteiro de 0 a ${MAX_SCREEN_COUNT}.`
}

const BY_ID = new Map(AMENITIES.map((amenity) => [amenity.id, amenity]))
const KNOWN_IDS = new Set([...BY_ID.keys(), ...HIDDEN_AMENITY_IDS])

/** Quantos ids a escrita aceita: todos os conhecidos, escondidos inclusive. */
export const MAX_AMENITY_IDS = KNOWN_IDS.size

/** A característica que se mostra; id escondido ou desconhecido dá `undefined`. */
export function findAmenity(id: number): Amenity | undefined {
  return BY_ID.get(id)
}

/**
 * Normaliza a lista que veio do cliente: descarta id desconhecido (ou
 * aposentado), remove repetido e ordena. Id escondido fica: é conhecido.
 *
 * A ordenação não é estética — a lista entra na chave do cache da busca, e
 * `[1,4]` e `[4,1]` são o mesmo filtro. Sem ordenar, seriam duas entradas
 * para o mesmo resultado.
 */
export function normalizeAmenityIds(ids: readonly number[]): number[] {
  return [...new Set(ids.filter((id) => KNOWN_IDS.has(id)))].sort(
    (a, b) => a - b
  )
}

export const HOUSE_OFFER_AMENITY_ID = 10

/**
 * O que o bar declara no checklist: tudo menos "Com oferta da casa", que não
 * se marca: é o bar Elite com oferta cadastrada, e só o filtro da busca o
 * usa (`amenityFilter`). O id era "Aceita reserva" até a reserva de mesa sair
 * do produto (16/10/2026); quem o marcou antes ainda o tem gravado em
 * `bar.amenities`, e nenhuma leitura olha para ele.
 */
export function declaredAmenityIds(ids: readonly number[]): number[] {
  return ids.filter((id) => id !== HOUSE_OFFER_AMENITY_ID)
}

/** O que a escrita grava: o filtro que vier do cliente é ignorado. */
export function writableAmenityIds(ids: readonly number[]): number[] {
  return normalizeAmenityIds(declaredAmenityIds(ids))
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
