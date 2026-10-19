import { describe, expect, test } from 'bun:test'

import { legalHead } from '@/components/legal/legal-head'
import { pageHead } from './page-head'

type Meta = {
  title?: string
  name?: string
  property?: string
  content?: string
}

const conteudo = (meta: Meta[], chave: string) =>
  meta
    .filter((m) => m.name === chave || m.property === chave)
    .map((m) => m.content)

describe('pageHead', () => {
  test('página indexável: canônica e og:url na mesma URL absoluta', () => {
    const head = pageHead({
      path: '/termos',
      title: 'Termos de uso — Onside',
      description: 'As regras.',
      indexable: true
    })
    expect(head.links).toEqual([
      { rel: 'canonical', href: 'https://www.onside.sh/termos' }
    ])
    expect(conteudo(head.meta, 'og:url')).toEqual([
      'https://www.onside.sh/termos'
    ])
    expect(conteudo(head.meta, 'robots')).toEqual(['index, follow'])
  })

  test('página noindex: sem canônica, com og:url da própria página', () => {
    const head = pageHead({
      path: '/login',
      title: 'Entrar — Onside',
      description: 'Entre.',
      indexable: false
    })
    expect(head.links).toEqual([])
    expect(conteudo(head.meta, 'robots')).toEqual(['noindex'])
    expect(conteudo(head.meta, 'og:url')).toEqual([
      'https://www.onside.sh/login'
    ])
  })

  test('título e descrição valem para busca, Open Graph e X, uma vez cada', () => {
    const head = pageHead({
      path: '/login',
      title: 'Entrar — Onside',
      description: 'Entre.',
      indexable: false
    })
    expect(head.meta.filter((m) => 'title' in m)).toEqual([
      { title: 'Entrar — Onside' }
    ])
    for (const chave of ['og:title', 'twitter:title']) {
      expect(conteudo(head.meta, chave)).toEqual(['Entrar — Onside'])
    }
    for (const chave of [
      'description',
      'og:description',
      'twitter:description'
    ]) {
      expect(conteudo(head.meta, chave)).toEqual(['Entre.'])
    }
  })

  test('cartão social com texto próprio não muda o título da busca', () => {
    const head = pageHead({
      path: '/',
      title: 'Onside — Onde assistir',
      description: 'Busca.',
      indexable: true,
      social: { title: 'Cartão', description: 'Social.' }
    })
    expect(head.meta[0]).toEqual({ title: 'Onside — Onde assistir' })
    expect(conteudo(head.meta, 'og:title')).toEqual(['Cartão'])
    expect(conteudo(head.meta, 'twitter:description')).toEqual(['Social.'])
  })
})

describe('legalHead', () => {
  test('termos saem como artigo indexável, com cartão do X completo', () => {
    const head = legalHead({
      path: '/termos',
      title: 'Termos de uso',
      description: 'As regras.'
    })
    expect(conteudo(head.meta, 'og:type')).toEqual(['article'])
    expect(conteudo(head.meta, 'twitter:title')).toEqual([
      'Termos de uso — Onside'
    ])
    expect(conteudo(head.meta, 'twitter:description')).toEqual(['As regras.'])
    expect(head.links).toEqual([
      { rel: 'canonical', href: 'https://www.onside.sh/termos' }
    ])
  })
})
