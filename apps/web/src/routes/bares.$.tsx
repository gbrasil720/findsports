import { createFileRoute, notFound } from '@tanstack/react-router'
import { listingHead } from '@/components/listing/listing-head'
import { ListingPage } from '@/components/listing/listing-page'
import { getPublicListing } from '@/functions/public-listing'

/**
 * `/bares/<cidade>` e `/bares/<cidade>/<bairro>`: um splat só, porque são duas
 * profundidades da mesma página. Cidade ou bairro sem bar no ar é 404; bairro
 * com poucos bares abre, mas sai `noindex` (`MIN_BARS_INDEXABLE_NEIGHBORHOOD`).
 */
export const Route = createFileRoute('/bares/$')({
  loader: async ({ params }) => {
    const slugs = params._splat?.split('/').filter(Boolean) ?? []
    if (slugs.length < 1 || slugs.length > 2) throw notFound()
    const listing = await getPublicListing({ data: slugs })
    if (!listing) throw notFound()
    return listing
  },
  head: ({ loaderData }) =>
    loaderData ? listingHead(loaderData.city, loaderData.neighborhood) : {},
  component: BaresRoute
})

function BaresRoute() {
  const { city, neighborhood } = Route.useLoaderData()
  return <ListingPage city={city} neighborhood={neighborhood} />
}
