import { describe, expect, it } from 'bun:test'

import { buildSitemap, escapeXml } from './sitemap'

const SITE = 'https://onside.com.br'

describe('escape de XML (ESC-20)', () => {
  it('escapa os cinco caracteres reservados', () => {
    expect(escapeXml(`& < > " '`)).toBe('&amp; &lt; &gt; &quot; &apos;')
  })

  it('escapa o & antes dos demais, sem duplicar', () => {
    // Se `&` fosse escapado depois, `&lt;` viraria `&amp;lt;`.
    expect(escapeXml('a<b')).toBe('a&lt;b')
    expect(escapeXml('a&b')).toBe('a&amp;b')
  })

  it('deixa texto comum intacto', () => {
    expect(escapeXml('Bar do Zé — Pinheiros')).toBe('Bar do Zé — Pinheiros')
  })
})

describe('montagem do sitemap (ESC-20)', () => {
  it('gera documento válido com a raiz', () => {
    const xml = buildSitemap(SITE, [{ path: '/', priority: 1 }])
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>')
    expect(xml).toContain(`<loc>${SITE}/</loc>`)
    expect(xml).toContain('<priority>1.0</priority>')
  })

  it('junta o caminho sem barra dupla', () => {
    const xml = buildSitemap(`${SITE}/`, [{ path: '/pub/abc' }])
    expect(xml).toContain(`<loc>${SITE}/pub/abc</loc>`)
    expect(xml).not.toContain('//pub')
  })

  it('escapa o que entra na URL', () => {
    // Um identificador com `&` quebraria o documento inteiro, e um sitemap
    // malformado é descartado por completo pelo rastreador.
    const xml = buildSitemap(SITE, [{ path: '/pub/a&b' }])
    expect(xml).toContain('<loc>https://onside.com.br/pub/a&amp;b</loc>')
    expect(xml).not.toMatch(/<loc>[^<]*&(?!amp;|lt;|gt;|quot;|apos;)/)
  })

  it('omite campos não informados', () => {
    const xml = buildSitemap(SITE, [{ path: '/pub/abc' }])
    expect(xml).not.toContain('<lastmod>')
    expect(xml).not.toContain('<changefreq>')
    expect(xml).not.toContain('<priority>')
  })

  it('lista uma entrada por bar', () => {
    const xml = buildSitemap(SITE, [
      { path: '/' },
      { path: '/pub/1' },
      { path: '/pub/2' }
    ])
    expect(xml.match(/<url>/g)).toHaveLength(3)
  })
})
