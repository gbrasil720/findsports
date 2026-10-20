import { describe, expect, it } from 'bun:test'

import type { PageInline } from '@/components/legal/legal-page'
import { SITE_URL } from '@/lib/site'
import { GUIA_ARTICLES } from './guia-articles'
import { guiaArticleHead, guiaArticleJsonLd, guiaIndexHead } from './guia-head'

type Meta = {
  title?: string
  name?: string
  property?: string
  content?: string
}

const metaDe = (head: { meta: Meta[] }, chave: string) =>
  head.meta.find((m) => m.name === chave || m.property === chave)?.content

/** Todo trecho de link dos artigos, inclusive dentro de listas. */
function linksDoArtigo(article: (typeof GUIA_ARTICLES)[number]): string[] {
  const trechos: PageInline[] = []
  const rich = (conteudo: string | PageInline[]) => {
    if (typeof conteudo !== 'string') trechos.push(...conteudo)
  }
  for (const paragrafo of article.document.intro) rich(paragrafo)
  for (const secao of article.document.sections) {
    for (const bloco of secao.blocks) {
      if (bloco.type === 'p' || bloco.type === 'attention') rich(bloco.content)
      if (bloco.type === 'ul') for (const item of bloco.items) rich(item)
    }
  }
  const links = trechos.flatMap((t) =>
    typeof t === 'object' && 'link' in t ? [t.to] : []
  )
  return [...links, article.document.other.to, article.closing.href]
}

describe('guia', () => {
  it('slugs únicos, em minúsculas e com hífen', () => {
    const slugs = GUIA_ARTICLES.map((a) => a.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
    for (const slug of slugs) expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
  })

  it('cada artigo tem título e descrição próprios, no tamanho que a busca mostra', () => {
    const titulos = GUIA_ARTICLES.map((a) => a.seoTitle)
    const descricoes = GUIA_ARTICLES.map((a) => a.description)
    expect(new Set(titulos).size).toBe(titulos.length)
    expect(new Set(descricoes).size).toBe(descricoes.length)
    for (const article of GUIA_ARTICLES) {
      expect(`${article.seoTitle} — Onside`.length).toBeLessThanOrEqual(70)
      expect(article.description.length).toBeGreaterThanOrEqual(70)
      expect(article.description.length).toBeLessThanOrEqual(160)
    }
  })

  it('head do artigo: canônica absoluta, og:url igual à canônica, tipo article', () => {
    for (const article of GUIA_ARTICLES) {
      const head = guiaArticleHead(article)
      const url = `${SITE_URL}/guia/${article.slug}`
      expect(head.links).toEqual([{ rel: 'canonical', href: url }])
      expect(metaDe(head, 'og:url')).toBe(url)
      expect(metaDe(head, 'og:type')).toBe('article')
      expect(metaDe(head, 'robots')).toBe('index, follow')
      expect(metaDe(head, 'twitter:title')).toBe(`${article.seoTitle} — Onside`)
      expect(head.meta[0]).toEqual({ title: `${article.seoTitle} — Onside` })
    }
    expect(guiaIndexHead().links).toEqual([
      { rel: 'canonical', href: `${SITE_URL}/guia` }
    ])
  })

  it('JSON-LD Article com título visível, datas e a Onside como autora', () => {
    for (const article of GUIA_ARTICLES) {
      const [artigo, trilha] = guiaArticleJsonLd(article)['@graph']
      expect(artigo).toMatchObject({
        '@type': 'Article',
        headline: article.document.title,
        datePublished: article.published,
        dateModified: article.modified,
        mainEntityOfPage: `${SITE_URL}/guia/${article.slug}`,
        author: { '@id': `${SITE_URL}/#organization` }
      })
      expect(article.modified >= article.published).toBe(true)
      expect(trilha?.['@type']).toBe('BreadcrumbList')
    }
  })

  it('leva para a home e para o cadastro, e todo link interno existe', () => {
    const existentes = new Set([
      '/',
      '/#como-funciona',
      '/signup',
      '/signup?role=pub',
      ...GUIA_ARTICLES.map((a) => `/guia/${a.slug}`)
    ])
    for (const article of GUIA_ARTICLES) {
      const links = linksDoArtigo(article)
      for (const link of links) expect(existentes).toContain(link)
      expect(links.some((link) => link.startsWith('/signup'))).toBe(true)
      expect(links.some((link) => link.startsWith('/#') || link === '/')).toBe(
        true
      )
      // O "Leia também" aponta para outro artigo, não para o próprio.
      expect(article.document.other.to).not.toBe(`/guia/${article.slug}`)
    }
  })
})
