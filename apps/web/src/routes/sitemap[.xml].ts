import { createFileRoute } from '@tanstack/react-router'
import { GUIA_ARTICLES } from '@/components/guia/guia-articles'
import { GUIA_PATH } from '@/components/guia/guia-head'
import { SITE_URL } from '@/lib/site'
import { buildSitemap, type SitemapEntry } from '@/lib/sitemap'

/**
 * Sitemap.
 *
 * Lista apenas o que é público: home, páginas legais, guia e a página de
 * cada bar no ar (`/bar/$slug`, aberta desde 05/11/2026). Bar fora do ar sai
 * `noindex` e não entra; prefixo de id repetido também não (a página dá 404,
 * ver `bar-slug.ts`). O cache de um dia é o atraso de bar novo aparecer aqui.
 */
const CACHE_SEGUNDOS = 60 * 60 * 24

/** A edição mais recente entre os bares da listagem, como YYYY-MM-DD. */
function lastModified(bars: { updatedAt: Date }[]): string | undefined {
  const times = bars.map((bar) => bar.updatedAt.getTime())
  return times.length
    ? new Date(Math.max(...times)).toISOString().slice(0, 10)
    : undefined
}

export const Route = createFileRoute('/sitemap.xml')({
  server: {
    handlers: {
      GET: async () => {
        // Import dentro do handler: o banco não pode ir para o bundle do
        // navegador junto com a árvore de rotas.
        const { listLiveBarPaths } = await import(
          '@findsports_oficial/api/lib/public-bar-page'
        )
        const { readListings } = await import(
          '@findsports_oficial/api/lib/public-listing'
        )
        const [bares, cidades] = await Promise.all([
          listLiveBarPaths(),
          readListings()
        ])
        const entradas: SitemapEntry[] = [
          { path: '/', changeFrequency: 'daily', priority: 1 },
          { path: '/termos', changeFrequency: 'monthly', priority: 0.3 },
          { path: '/privacidade', changeFrequency: 'monthly', priority: 0.3 },
          { path: GUIA_PATH, changeFrequency: 'weekly', priority: 0.6 },
          ...GUIA_ARTICLES.map(
            (article): SitemapEntry => ({
              path: `${GUIA_PATH}/${article.slug}`,
              lastModified: article.modified,
              changeFrequency: 'monthly',
              priority: 0.6
            })
          ),
          // Listagens: cidade e bairro só a partir do piso
          // (`MIN_BARS_INDEXABLE_CITY` e `MIN_BARS_INDEXABLE_NEIGHBORHOOD`),
          // o resto sai `noindex`.
          ...cidades
            .filter((cidade) => cidade.indexable)
            .flatMap((cidade): SitemapEntry[] => [
              {
                path: `/bares/${cidade.slug}`,
                lastModified: lastModified(cidade.bars),
                changeFrequency: 'daily',
                priority: 0.8
              },
              ...cidade.neighborhoods
                .filter((bairro) => bairro.indexable)
                .map(
                  (bairro): SitemapEntry => ({
                    path: `/bares/${cidade.slug}/${bairro.slug}`,
                    lastModified: lastModified(bairro.bars),
                    changeFrequency: 'daily',
                    priority: 0.7
                  })
                )
            ]),
          ...bares.map(
            (bar): SitemapEntry => ({
              path: bar.path,
              lastModified: bar.updatedAt.toISOString().slice(0, 10),
              changeFrequency: 'daily',
              priority: 0.7
            })
          )
        ]

        return new Response(buildSitemap(SITE_URL, entradas), {
          headers: {
            'Content-Type': 'application/xml; charset=utf-8',
            'Cache-Control': `public, max-age=${CACHE_SEGUNDOS}, s-maxage=${CACHE_SEGUNDOS}, stale-while-revalidate=86400`
          }
        })
      }
    }
  }
})
