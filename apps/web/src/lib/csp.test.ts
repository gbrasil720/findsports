import { describe, expect, test } from 'bun:test'

import { applyContentSecurityPolicy } from '../start'
import { contentSecurityPolicy, createNonce } from './csp'

function directive(policy: string, name: string) {
  return policy
    .split('; ')
    .find((d) => d.startsWith(`${name} `))
    ?.slice(name.length + 1)
}

describe('CSP do SSR', () => {
  test('nonce novo a cada resposta, com 128 bits', () => {
    const a = createNonce()
    expect(a).not.toBe(createNonce())
    expect(atob(a)).toHaveLength(16)
  })

  test('script só com o nonce; o resto travado', () => {
    const policy = contentSecurityPolicy('abc')
    expect(directive(policy, 'script-src')).toBe(
      "'nonce-abc' 'strict-dynamic' https: 'unsafe-inline'"
    )
    expect(directive(policy, 'object-src')).toBe("'none'")
    expect(directive(policy, 'base-uri')).toBe("'self'")
    expect(directive(policy, 'form-action')).toBe("'self'")
    // Mantém o iframe da página do bar no cadastro (`torcedor-ve.tsx`).
    expect(directive(policy, 'frame-ancestors')).toBe("'self'")
    expect(directive(policy, 'frame-src')).toContain(
      'https://challenges.cloudflare.com'
    )
  })

  test('connect-src leva a origem dos tiles configurada', () => {
    expect(directive(contentSecurityPolicy('n'), 'connect-src')).toContain(
      'https://tiles.onside.sh'
    )
    const stub = contentSecurityPolicy('n', 'http://127.0.0.1:3202/tiles.json')
    expect(directive(stub, 'connect-src')).toContain('http://127.0.0.1:3202')
    expect(directive(stub, 'connect-src')).toContain(
      'https://*.r2.cloudflarestorage.com'
    )
  })

  test('só o HTML recebe a política', () => {
    const html = new Headers({ 'Content-Type': 'text/html; charset=utf-8' })
    applyContentSecurityPolicy(html, 'n1')
    expect(html.get('Content-Security-Policy')).toContain("'nonce-n1'")

    const json = new Headers({ 'Content-Type': 'application/json' })
    applyContentSecurityPolicy(json, 'n1')
    expect(json.get('Content-Security-Policy')).toBeNull()
  })
})
