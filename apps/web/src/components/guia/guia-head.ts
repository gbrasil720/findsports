import { pageHead } from '@/lib/page-head'
import { OG_IMAGE_URL, SITE_URL } from '@/lib/site'
import type { GuiaArticle } from './guia-articles'

export const GUIA_PATH = '/guia'
export const GUIA_TITLE = 'Guia da Onside'
export const GUIA_DESCRIPTION =
  'Como escolher o bar para assistir ao jogo, achar quem passa a partida do seu time e atrair torcedores para o seu bar: o guia da Onside.'

const HOME_URL = `${SITE_URL}/`
const ORGANIZATION = { '@id': `${HOME_URL}#organization` }

export function guiaArticleUrl(article: GuiaArticle): string {
  return `${SITE_URL}${GUIA_PATH}/${article.slug}`
}

/** Índice do guia: indexável, com canônica (o resto do cartão vem da raiz). */
export function guiaIndexHead() {
  return pageHead({
    path: GUIA_PATH,
    title: 'Guia: como escolher o bar para ver o jogo — Onside',
    description: GUIA_DESCRIPTION,
    indexable: true
  })
}

/** Artigo: `pageHead` como `article`, mais as datas de publicação. */
export function guiaArticleHead(article: GuiaArticle) {
  const head = pageHead({
    path: `${GUIA_PATH}/${article.slug}`,
    title: `${article.seoTitle} — Onside`,
    description: article.description,
    indexable: true,
    ogType: 'article'
  })
  return {
    ...head,
    meta: [
      ...head.meta,
      { property: 'article:published_time', content: article.published },
      { property: 'article:modified_time', content: article.modified }
    ]
  }
}

/** `Article` e trilha (Início › Guia › artigo), num `@graph` só. */
export function guiaArticleJsonLd(article: GuiaArticle) {
  const url = guiaArticleUrl(article)
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Article',
        '@id': `${url}#article`,
        headline: article.document.title,
        description: article.description,
        inLanguage: 'pt-BR',
        datePublished: article.published,
        dateModified: article.modified,
        image: OG_IMAGE_URL,
        mainEntityOfPage: url,
        author: ORGANIZATION,
        publisher: ORGANIZATION
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Início', item: HOME_URL },
          {
            '@type': 'ListItem',
            position: 2,
            name: 'Guia',
            item: `${SITE_URL}${GUIA_PATH}`
          },
          {
            '@type': 'ListItem',
            position: 3,
            name: article.document.title,
            item: url
          }
        ]
      }
    ]
  }
}
