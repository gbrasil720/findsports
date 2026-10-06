import { OG_IMAGE_URL, SITE_URL } from '@/lib/site'

/** `head` das páginas legais: indexáveis, com canônica e cartão social. */
export function legalHead(page: {
  path: '/termos' | '/privacidade'
  title: string
  description: string
}) {
  const title = `${page.title} — Onside`
  const url = `${SITE_URL}${page.path}`
  return {
    meta: [
      { title },
      { name: 'description', content: page.description },
      { name: 'robots', content: 'index, follow' },
      { property: 'og:title', content: title },
      { property: 'og:description', content: page.description },
      { property: 'og:type', content: 'article' },
      { property: 'og:url', content: url },
      { property: 'og:image', content: OG_IMAGE_URL },
      { property: 'og:site_name', content: 'Onside' },
      { property: 'og:locale', content: 'pt_BR' },
      { name: 'twitter:card', content: 'summary_large_image' }
    ],
    links: [{ rel: 'canonical', href: url }]
  }
}
