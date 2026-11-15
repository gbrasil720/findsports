import { readListings } from '@findsports_oficial/api/lib/public-listing'
import { createServerFn } from '@tanstack/react-start'

/**
 * A listagem pública de `/bares/<cidade>` ou `/bares/<cidade>/<bairro>`, lida
 * no servidor para sair no HTML. `null`: cidade ou bairro sem bar no ar, 404.
 */
export const getPublicListing = createServerFn({ method: 'GET' })
  .inputValidator((slugs: string[]) =>
    slugs.slice(0, 2).map((slug) => String(slug).slice(0, 120))
  )
  .handler(async ({ data: [citySlug, neighborhoodSlug] }) => {
    if (!citySlug) return null
    const city = (await readListings()).find((c) => c.slug === citySlug)
    if (!city) return null
    if (!neighborhoodSlug) return { city, neighborhood: null }
    const neighborhood = city.neighborhoods.find(
      (n) => n.slug === neighborhoodSlug
    )
    return neighborhood ? { city, neighborhood } : null
  })
