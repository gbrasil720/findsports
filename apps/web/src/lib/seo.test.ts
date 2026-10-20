import { describe, expect, it } from 'bun:test'
import fs from 'node:fs'
import path from 'node:path'

import { GUIA_ARTICLES } from '@/components/guia/guia-articles'
import { GUIA_PATH } from '@/components/guia/guia-head'
import { SOCIAL_LINKS } from '@/components/landing/onside-landing-content'
import { HOME_STRUCTURED_DATA, jsonLd } from './structured-data'

const PUBLIC = path.join(import.meta.dir, '../../public')

type No = Record<string, unknown>
const graph = HOME_STRUCTURED_DATA['@graph'] as readonly No[]
const doTipo = (tipo: string) => graph.find((no) => no['@type'] === tipo)

describe('JSON-LD da home (nome do site no Google)', () => {
  it('WebSite com nome Onside e a home canônica com barra', () => {
    const site = doTipo('WebSite')
    expect(site).toMatchObject({
      name: 'Onside',
      url: 'https://www.onside.sh/',
      inLanguage: 'pt-BR'
    })
    expect(site?.alternateName).toContain('onside.sh')
  })

  it('Organization com logo quadrado de pelo menos 112 px e as redes do rodapé', () => {
    const org = doTipo('Organization') as No
    expect(org.name).toBe('Onside')
    const logo = org.logo as { url: string; width: number; height: number }
    expect(logo.width).toBe(logo.height)
    expect(logo.width).toBeGreaterThanOrEqual(112)
    const arquivo = path.join(PUBLIC, new URL(logo.url).pathname)
    expect(fs.existsSync(arquivo)).toBe(true)
    expect(org.sameAs).toEqual(SOCIAL_LINKS.map((rede) => rede.href))
  })

  it('o WebSite aponta para a Organization como publisher', () => {
    const site = doTipo('WebSite') as No
    expect(site.publisher).toEqual({ '@id': doTipo('Organization')?.['@id'] })
  })

  it('jsonLd não deixa texto fechar o <script>', () => {
    const saida = jsonLd({ nome: '</script><script>alert(1)</script>' })
    expect(saida).not.toContain('<')
    expect(JSON.parse(saida).nome).toBe('</script><script>alert(1)</script>')
  })
})

/** Casamento de regra do robots.txt como o Google faz: prefixo, `$` no fim. */
function bloqueado(robots: string, caminho: string): boolean {
  return robots
    .split('\n')
    .filter((linha) => linha.startsWith('Disallow:'))
    .map((linha) => linha.slice('Disallow:'.length).trim())
    .some((regra) =>
      regra.endsWith('$')
        ? caminho === regra.slice(0, -1)
        : caminho.startsWith(regra)
    )
}

describe('robots.txt', () => {
  const robots = fs.readFileSync(path.join(PUBLIC, 'robots.txt'), 'utf8')

  it('deixa as páginas públicas e os ícones abertos', () => {
    for (const caminho of [
      '/',
      '/termos',
      '/privacidade',
      '/guia',
      '/guia/onde-assistir-futebol-em-sao-paulo',
      '/llms.txt',
      '/sitemap.xml',
      '/favicon.ico',
      '/favicon-48x48.png',
      '/apple-touch-icon.png',
      '/icons/icon-512.png',
      '/og-image.jpg'
    ]) {
      expect(bloqueado(robots, caminho)).toBe(false)
    }
  })

  it('fecha as áreas logadas e o painel interno', () => {
    for (const caminho of [
      '/dashboard',
      '/dashboard/games',
      '/admin',
      '/admin/billing',
      '/plan',
      '/plan/confirmed',
      '/onboarding/fan',
      '/houdini',
      '/app',
      '/api/trpc/x'
    ]) {
      expect(bloqueado(robots, caminho)).toBe(true)
    }
  })

  it('aponta o sitemap no host canônico', () => {
    expect(robots).toContain('Sitemap: https://www.onside.sh/sitemap.xml')
  })
})

describe('favicon para o Google', () => {
  it('tem PNG quadrado com lado múltiplo de 48', () => {
    for (const lado of [48, 96, 192]) {
      const arquivo = path.join(PUBLIC, `favicon-${lado}x${lado}.png`)
      const png = fs.readFileSync(arquivo)
      // IHDR: largura e altura em big-endian nos bytes 16 a 23.
      expect(png.readUInt32BE(16)).toBe(lado)
      expect(png.readUInt32BE(20)).toBe(lado)
    }
  })
})

describe('llms.txt (llmstxt.org)', () => {
  const llms = fs.readFileSync(path.join(PUBLIC, 'llms.txt'), 'utf8')
  const links = [...llms.matchAll(/\]\((https?:\/\/[^)]+)\)/g)].map(
    (m) => new URL(m[1] as string)
  )

  it('abre com o título H1 e o resumo em citação', () => {
    const [titulo, , resumo] = llms.split('\n')
    expect(titulo).toBe('# Onside')
    expect(resumo?.startsWith('> ')).toBe(true)
  })

  it('só aponta para páginas públicas do host canônico e para as redes', () => {
    const publicas = [
      '/',
      '/signup',
      '/login',
      '/termos',
      '/privacidade',
      GUIA_PATH,
      ...GUIA_ARTICLES.map((article) => `${GUIA_PATH}/${article.slug}`)
    ]
    const redes: string[] = SOCIAL_LINKS.map((rede) => rede.href)
    for (const link of links) {
      if (link.hostname === 'www.onside.sh') {
        expect(publicas).toContain(link.pathname)
      } else {
        expect(redes).toContain(link.href)
      }
    }
  })

  it('lista o guia e todos os artigos', () => {
    const caminhos = links.map((link) => link.pathname)
    expect(caminhos).toContain(GUIA_PATH)
    for (const article of GUIA_ARTICLES) {
      expect(caminhos).toContain(`${GUIA_PATH}/${article.slug}`)
    }
  })

  it('leva aos termos e à política de privacidade', () => {
    const caminhos = links.map((link) => link.pathname)
    expect(caminhos).toContain('/termos')
    expect(caminhos).toContain('/privacidade')
  })

  it('sai como text/plain em UTF-8 e não é bloqueado pelo robots.txt', () => {
    const headers = fs.readFileSync(path.join(PUBLIC, '_headers'), 'utf8')
    expect(headers).toContain(
      '/llms.txt\n  Access-Control-Allow-Origin: *\n  Content-Type: text/plain; charset=utf-8'
    )
    const robots = fs.readFileSync(path.join(PUBLIC, 'robots.txt'), 'utf8')
    expect(bloqueado(robots, '/llms.txt')).toBe(false)
  })
})
