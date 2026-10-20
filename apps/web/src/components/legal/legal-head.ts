import { pageHead } from '@/lib/page-head'

/** `head` das páginas legais: indexáveis, com canônica e cartão social. */
export function legalHead(page: {
  path: '/termos' | '/privacidade'
  title: string
  description: string
}) {
  return pageHead({
    path: page.path,
    title: `${page.title} — Onside`,
    description: page.description,
    indexable: true,
    ogType: 'article'
  })
}
