import { barSlug } from './bar-slug'

/**
 * Listagens públicas por cidade e bairro (`/bares/<cidade>` e
 * `/bares/<cidade>/<bairro>`): as páginas que respondem "bares para ver o
 * jogo em <lugar>". Este arquivo só agrupa; quem lê o banco é
 * `packages/api/src/lib/public-listing.ts`.
 *
 * Sem imports além de `bar-slug`: o web monta os links, o servidor agrupa.
 */

/**
 * Bairro com menos bares que isto sai `noindex` e fora do sitemap: uma página
 * com um ou dois bares é conteúdo fino. Ela continua abrindo (o link do
 * breadcrumb do bar não pode dar 404) e os bares dela aparecem na cidade.
 */
export const MIN_BARS_INDEXABLE_NEIGHBORHOOD = 3

export type ListingBar = {
  id: string
  name: string
  neighborhood: string
  city: string
  uf: string | null
  photoUrl: string | null
  updatedAt: Date
}

export type NeighborhoodListing = {
  slug: string
  name: string
  bars: ListingBar[]
  indexable: boolean
}

export type CityListing = {
  slug: string
  name: string
  uf: string | null
  bars: ListingBar[]
  neighborhoods: NeighborhoodListing[]
}

const LOWERCASE_WORDS = new Set(['de', 'da', 'do', 'das', 'dos', 'e'])

/**
 * "vila assunção" → "Vila Assunção". Só sobe a primeira letra de cada palavra
 * e deixa o resto como o dono digitou. Preposição fica em minúscula, menos no
 * começo.
 */
export function properName(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((word, index) => {
      if (!word) return word
      if (index > 0 && LOWERCASE_WORDS.has(word)) return word
      return word.charAt(0).toUpperCase() + word.slice(1)
    })
    .join(' ')
}

export function citySlug(city: string): string {
  return barSlug(city)
}

export function neighborhoodSlug(neighborhood: string): string {
  return barSlug(neighborhood)
}

/** `/bares/santo-andre`. `null` quando o nome não tem letra nenhuma. */
export function cityPath(city: string): string | null {
  const slug = citySlug(city)
  return slug ? `/bares/${slug}` : null
}

/** `/bares/santo-andre/vila-assuncao`. */
export function neighborhoodPath(
  city: string,
  neighborhood: string
): string | null {
  const base = cityPath(city)
  const slug = neighborhoodSlug(neighborhood)
  return base && slug ? `${base}/${slug}` : null
}

/** A grafia mais usada entre os bares; empate fica com a primeira lida. */
function commonest(values: string[]): string {
  const counts = new Map<string, number>()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  let best = values[0] ?? ''
  let bestCount = 0
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value
      bestCount = count
    }
  }
  return best
}

function sortBars(bars: ListingBar[]): ListingBar[] {
  return [...bars].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
}

function bySizeThenName<T extends { name: string; bars: unknown[] }>(
  a: T,
  b: T
): number {
  return (
    b.bars.length - a.bars.length || a.name.localeCompare(b.name, 'pt-BR')
  )
}

/**
 * Agrupa os bares no ar por cidade e, dentro dela, por bairro. A chave é o
 * slug, então "Vila assunção" e "Vila Assunção" caem na mesma página. Bar sem
 * letra na cidade fica de fora; sem letra no bairro, fica só na cidade.
 */
export function buildListings(bars: readonly ListingBar[]): CityListing[] {
  const byCity = new Map<string, ListingBar[]>()
  for (const bar of bars) {
    const slug = citySlug(bar.city)
    if (!slug) continue
    const list = byCity.get(slug)
    if (list) list.push(bar)
    else byCity.set(slug, [bar])
  }

  const cities: CityListing[] = []
  for (const [slug, cityBars] of byCity) {
    const byNeighborhood = new Map<string, ListingBar[]>()
    for (const bar of cityBars) {
      const nSlug = neighborhoodSlug(bar.neighborhood)
      if (!nSlug) continue
      const list = byNeighborhood.get(nSlug)
      if (list) list.push(bar)
      else byNeighborhood.set(nSlug, [bar])
    }
    const neighborhoods = [...byNeighborhood]
      .map(([nSlug, list]) => ({
        slug: nSlug,
        name: properName(commonest(list.map((b) => b.neighborhood))),
        bars: sortBars(list),
        indexable: list.length >= MIN_BARS_INDEXABLE_NEIGHBORHOOD
      }))
      .sort(bySizeThenName)
    cities.push({
      slug,
      name: properName(commonest(cityBars.map((b) => b.city))),
      uf: commonest(cityBars.flatMap((b) => (b.uf ? [b.uf] : []))) || null,
      bars: sortBars(cityBars),
      neighborhoods
    })
  }
  return cities.sort(bySizeThenName)
}
