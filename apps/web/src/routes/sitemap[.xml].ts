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

export const Route = createFileRoute('/sitemap.xml')({
  server: {
    handlers: {
      GET: async () => {
        // Import dentro do handler: o banco não pode ir para o bundle do
        // navegador junto com a árvore de rotas.
        const { listLiveBarPaths } = await import(
          '@findsports_oficial/api/lib/public-bar-page'
        )
        const bares = await listLiveBarPaths()
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
