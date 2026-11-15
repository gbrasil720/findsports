import type {
  CityListing,
  NeighborhoodListing
} from '@findsports_oficial/db/bar-listing'
import { barPath } from '@findsports_oficial/db/bar-slug'
import { pageHead } from '@/lib/page-head'
import { SITE_URL } from '@/lib/site'

const HOME_URL = `${SITE_URL}/`

export function cityListingPath(city: CityListing): string {
  return `/bares/${city.slug}`
}

export function neighborhoodListingPath(
  city: CityListing,
  neighborhood: NeighborhoodListing
): string {
  return `/bares/${city.slug}/${neighborhood.slug}`
}

function place(city: CityListing, neighborhood: NeighborhoodListing | null) {
  const cityName = city.uf ? `${city.name}, ${city.uf}` : city.name
  return neighborhood ? `${neighborhood.name}, ${cityName}` : cityName
}

function barsLabel(total: number): string {
  return total === 1 ? '1 bar' : `${total} bares`
}

export function listingTitle(
  city: CityListing,
  neighborhood: NeighborhoodListing | null
): string {
  return `Bares para ver o jogo em ${place(city, neighborhood)} — Onside`
}

export function listingDescription(
  city: CityListing,
  neighborhood: NeighborhoodListing | null
): string {
  const total = (neighborhood ?? city).bars.length
  return `${barsLabel(total)} para assistir ao jogo em ${place(city, neighborhood)}. Veja quem passa a partida do seu time, o telão e o som, e escolha pela Onside.`
}

/** Bairro abaixo do piso de bares sai `noindex` (conteúdo fino). */
export function listingHead(
  city: CityListing,
  neighborhood: NeighborhoodListing | null
) {
  return pageHead({
    path: neighborhood
      ? neighborhoodListingPath(city, neighborhood)
      : cityListingPath(city),
    title: listingTitle(city, neighborhood),
    description: listingDescription(city, neighborhood),
    indexable: neighborhood ? neighborhood.indexable : true
  })
}

/** `BreadcrumbList` e `ItemList` dos bares, num `@graph` só. */
export function listingJsonLd(
  city: CityListing,
  neighborhood: NeighborhoodListing | null
) {
  const cityUrl = `${SITE_URL}${cityListingPath(city)}`
  const crumbs = [
    { name: 'Início', item: HOME_URL },
    { name: city.name, item: cityUrl },
    ...(neighborhood
      ? [
          {
            name: neighborhood.name,
            item: `${SITE_URL}${neighborhoodListingPath(city, neighborhood)}`
          }
        ]
      : [])
  ]
  const bars = (neighborhood ?? city).bars
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: crumbs.map((crumb, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          name: crumb.name,
          item: crumb.item
        }))
      },
      {
        '@type': 'ItemList',
        name: listingTitle(city, neighborhood).replace(' — Onside', ''),
        numberOfItems: bars.length,
        itemListElement: bars.map((bar, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          name: bar.name,
          url: `${SITE_URL}${barPath(bar)}`
        }))
      }
    ]
  }
}
