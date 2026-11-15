import { db } from '@findsports_oficial/db'
import {
  buildListings,
  type ListingBar
} from '@findsports_oficial/db/bar-listing'
import { BAR_REF_LENGTH } from '@findsports_oficial/db/bar-slug'
import { bar } from '@findsports_oficial/db/schema/platform'

/**
 * Os bares no ar para as listagens por cidade e bairro. Prefixo de id
 * repetido fica de fora, como no sitemap: a página do bar daria 404 e o link
 * da listagem seria quebrado.
 */
export async function readLiveListingBars(): Promise<ListingBar[]> {
  const rows = await db
    .select({
      id: bar.id,
      name: bar.name,
      neighborhood: bar.neighborhood,
      city: bar.city,
      uf: bar.uf,
      photoUrl: bar.photoUrl,
      updatedAt: bar.updatedAt,
      isActive: bar.isActive
    })
    .from(bar)
  const perRef = new Map<string, number>()
  for (const row of rows) {
    const ref = row.id.slice(0, BAR_REF_LENGTH)
    perRef.set(ref, (perRef.get(ref) ?? 0) + 1)
  }
  return rows
    .filter(
      (row) => row.isActive && perRef.get(row.id.slice(0, BAR_REF_LENGTH)) === 1
    )
    .map(({ isActive: _isActive, ...row }) => row)
}

export async function readListings() {
  return buildListings(await readLiveListingBars())
}
