import { SITE_URL } from '@/lib/site'

/**
 * `head` de página pública: título, descrição, robots, Open Graph e cartão do
 * X/Twitter saem do mesmo par título/descrição, e `og:url` é sempre a URL da
 * própria página. A raiz (`__root.tsx`) só põe o que vale para o site todo
 * (`og:site_name`, `og:locale`, imagem e tipo do cartão); se ela pusesse título
 * ou `og:url`, a página que esquecesse de sobrescrever sairia com os da home.
 *
 * Canônica só em página indexável. Em `noindex` ela não ajuda (a página não
 * entra no índice) e, apontando para outra URL, contradiz o `noindex`.
 */
export type PageHeadInput = {
  /** Caminho sem query, começando com `/`. */
  path: string
  title: string
  description: string
  indexable: boolean
  /** Título e descrição do cartão social, quando diferentes dos da busca. */
  social?: { title: string; description: string }
  ogType?: 'website' | 'article'
}

export function pageHead(page: PageHeadInput) {
  const url = `${SITE_URL}${page.path}`
  const social = page.social ?? {
    title: page.title,
    description: page.description
  }
  return {
    meta: [
      { title: page.title },
      { name: 'description', content: page.description },
      {
        name: 'robots',
        content: page.indexable ? 'index, follow' : 'noindex'
      },
      { property: 'og:title', content: social.title },
      { property: 'og:description', content: social.description },
      { property: 'og:url', content: url },
      { property: 'og:type', content: page.ogType ?? 'website' },
      { name: 'twitter:title', content: social.title },
      { name: 'twitter:description', content: social.description }
    ],
    links: page.indexable ? [{ rel: 'canonical', href: url }] : []
  }
}
