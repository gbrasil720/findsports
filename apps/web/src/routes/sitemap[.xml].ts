import { createFileRoute } from '@tanstack/react-router'
import { SITE_URL } from '@/lib/site'
import { buildSitemap, type SitemapEntry } from '@/lib/sitemap'

/**
 * Sitemap.
 *
 * Lista apenas o que é público. As páginas de bar NÃO entram: elas exigem
 * login, porque o registro de analytics depende de um fã identificado
 * (`actor_user_id`). Anunciá-las na busca levaria o visitante a um portão de
 * login e, pior, traria tráfego que o painel do bar não consegue contabilizar.
 *
 * Se um dia as páginas de bar puderem ser públicas — o que exige antes
 * resolver como atribuir visita anônima —, basta acrescentar uma entrada por
 * bar ativo aqui; a montagem já trata escape e formato.
 */
const CACHE_SEGUNDOS = 60 * 60 * 24

export const Route = createFileRoute('/sitemap.xml')({
  server: {
    handlers: {
      GET: () => {
        const entradas: SitemapEntry[] = [
          { path: '/', changeFrequency: 'daily', priority: 1 }
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
