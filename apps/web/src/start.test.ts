import { describe, expect, test } from 'bun:test'

import { applyPrivateCache } from './start'

function cacheControl(path: string, cookie?: string, initial?: string) {
  const request = new Request(`http://localhost${path}`, {
    headers: cookie ? { cookie } : {}
  })
  const headers = new Headers(initial ? { 'Cache-Control': initial } : {})
  applyPrivateCache(request, headers)
  return headers.get('Cache-Control')
}

const SESSION = 'better-auth.session_token=abc'

describe('applyPrivateCache (WEB-151)', () => {
  test('pedido com cookie de sessão sai private, no-store', () => {
    expect(cacheControl('/pub/x', SESSION)).toBe('private, no-store')
    expect(cacheControl('/', `__Secure-${SESSION}`)).toBe('private, no-store')
  })

  test('rota protegida sem sessão (o 307 para /login) sai private, no-store', () => {
    expect(cacheControl('/admin')).toBe('private, no-store')
  })

  test('visitante em página pública mantém o padrão da plataforma', () => {
    expect(cacheControl('/')).toBeNull()
    expect(cacheControl('/administrar')).toBeNull()
  })

  test('não sobrescreve o cache que a rota escolheu', () => {
    expect(cacheControl('/sitemap.xml', SESSION, 'public, max-age=86400')).toBe(
      'public, max-age=86400'
    )
  })
})
