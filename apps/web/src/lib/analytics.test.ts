import { describe, expect, test } from 'bun:test'
import { JSDOM } from 'jsdom'
import { ctaFromClickTarget } from './analytics'
import { getPageSurface } from './page-surface'

describe('getPageSurface', () => {
  test('maps product routes to a coarse surface', () => {
    expect(getPageSurface('/')).toBe('landing')
    expect(getPageSurface('/login')).toBe('auth')
    expect(getPageSurface('/signup')).toBe('auth')
    expect(getPageSurface('/onboarding/fan')).toBe('activation')
    expect(getPageSurface('/plan')).toBe('activation')
    expect(getPageSurface('/dashboard')).toBe('fan')
    expect(getPageSurface('/dashboard/profile')).toBe('fan')
    expect(getPageSurface('/pub/abc')).toBe('fan')
    expect(getPageSurface('/admin')).toBe('pub')
    expect(getPageSurface('/admin/billing')).toBe('pub')
    expect(getPageSurface('/internal/flags')).toBe('other')
  })
})

describe('ctaFromClickTarget', () => {
  const { window } = new JSDOM(`
    <a id="hero" href="/signup" data-cta="hero_signup">
      Criar conta <span id="icone"><svg id="seta"></svg></span>
    </a>
    <a id="solto" href="/login">Entrar</a>
    <a id="vazio" href="/signup" data-cta="">Criar conta</a>
  `)
  // `instanceof Element` olha o global; em produção é o do navegador.
  Object.defineProperty(globalThis, 'Element', {
    value: window.Element,
    configurable: true
  })
  const byId = (id: string) => window.document.getElementById(id)

  test('clique na chamada leva o valor do data-cta', () => {
    expect(ctaFromClickTarget(byId('hero'))).toBe('hero_signup')
  })

  test('clique no ícone de dentro da chamada conta para a chamada', () => {
    expect(ctaFromClickTarget(byId('seta'))).toBe('hero_signup')
  })

  test('clique fora de chamada não manda nada', () => {
    expect(ctaFromClickTarget(byId('solto'))).toBeNull()
    expect(ctaFromClickTarget(window.document.body)).toBeNull()
  })

  test('data-cta vazio e alvo que não é elemento não mandam nada', () => {
    expect(ctaFromClickTarget(byId('vazio'))).toBeNull()
    expect(ctaFromClickTarget(window.document)).toBeNull()
    expect(ctaFromClickTarget(null)).toBeNull()
  })
})
