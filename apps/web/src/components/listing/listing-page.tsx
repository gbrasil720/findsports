import type {
  CityListing,
  NeighborhoodListing
} from '@findsports_oficial/db/bar-listing'
import { barPath } from '@findsports_oficial/db/bar-slug'
import ArrowRight from 'reicon-react/icons/ArrowRight'
import { OnsideFooter, OnsideHeader } from '@/components/landing/onside-landing'
import { StructuredData } from '@/components/structured-data'
import {
  cityListingPath,
  listingDescription,
  listingJsonLd,
  neighborhoodListingPath
} from './listing-head'

const HERO_ID = 'top'

/**
 * Listagem de bares de uma cidade ou de um bairro. Mesmo visual das páginas
 * legais e do guia (`legal.css`). Todo link é `<a href>` comum, para o
 * rastreador seguir sem JavaScript.
 */
export function ListingPage({
  city,
  neighborhood
}: {
  city: CityListing
  neighborhood: NeighborhoodListing | null
}) {
  const current = neighborhood ?? city
  const title = neighborhood
    ? `Bares em ${neighborhood.name}, ${city.name}`
    : `Bares em ${city.name}${city.uf ? `, ${city.uf}` : ''}`

  return (
    <div className="onside-page onside-legal">
      <StructuredData data={listingJsonLd(city, neighborhood)} />
      <a className="onside-skip-link" href="#main">
        Pular para o conteúdo
      </a>

      <OnsideHeader home="/" inkHeroId={HERO_ID} />

      <main id="main">
        <section className="onside-legal-hero" id={HERO_ID}>
          <div className="onside-shell onside-legal-hero-grid">
            <div>
              <p className="onside-legal-kicker">
                <span aria-hidden="true" />
                {neighborhood ? (
                  <a href={cityListingPath(city)}>{city.name}</a>
                ) : (
                  'Onde assistir'
                )}
              </p>
              <h1>
                {title}
                <span aria-hidden="true">.</span>
              </h1>
              <div className="onside-legal-intro">
                <p>{listingDescription(city, neighborhood)}</p>
              </div>
            </div>

            <nav className="onside-legal-side" aria-label="Bares">
              {current.bars.map((bar) => (
                <a
                  key={bar.id}
                  className="onside-legal-other"
                  href={barPath(bar)}
                >
                  <span>
                    <span>{bar.neighborhood}</span>
                    <b>{bar.name}</b>
                  </span>
                  <ArrowRight size={16} aria-hidden="true" focusable="false" />
                </a>
              ))}
            </nav>
          </div>
        </section>

        {neighborhood ? null : (
          <section className="onside-legal-contact">
            <div className="onside-shell">
              <div>
                <p>Bairros</p>
                <ul>
                  {city.neighborhoods.map((item) => (
                    <li key={item.slug}>
                      <a href={neighborhoodListingPath(city, item)}>
                        {item.name} ({item.bars.length})
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>
        )}
      </main>

      <OnsideFooter home="/" />
    </div>
  )
}
