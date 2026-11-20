import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

import {
  FRAME_ANCESTORS,
  HSTS,
  SECURITY_HEADERS,
  withSecurityHeaders
} from './security-headers'

describe('Headers de segurança no Worker', () => {
  test('resposta dinâmica sai com HSTS e mantém status, headers e corpo', async () => {
    const original = Response.redirect('https://www.onside.sh/login', 307)
    const response = withSecurityHeaders(original)
    expect(response.status).toBe(307)
    expect(response.headers.get('Location')).toBe('https://www.onside.sh/login')
    expect(response.headers.get('Strict-Transport-Security')).toBe(HSTS)
    for (const [name, value] of Object.entries(SECURITY_HEADERS))
      expect(response.headers.get(name)).toBe(value)

    const page = withSecurityHeaders(
      new Response('ok', { headers: { 'X-A': '1' } })
    )
    expect(page.headers.get('X-A')).toBe('1')
    expect(await page.text()).toBe('ok')
  })

  // REPORT.md §6: sem trava de iframe, outro site podia emoldurar o web.
  test('resposta dinâmica só abre em iframe da própria origem', () => {
    const page = withSecurityHeaders(new Response('ok'))
    expect(page.headers.get('Content-Security-Policy')).toBe(FRAME_ANCESTORS)
    expect(page.headers.get('X-Frame-Options')).toBe('SAMEORIGIN')

    const comCsp = withSecurityHeaders(
      new Response('ok', {
        headers: { 'Content-Security-Policy': "default-src 'self'" }
      })
    )
    expect(comCsp.headers.get('Content-Security-Policy')).toBe(
      "default-src 'self'; frame-ancestors 'self'"
    )

    const comTrava = withSecurityHeaders(
      new Response('ok', {
        headers: { 'Content-Security-Policy': "frame-ancestors 'none'" }
      })
    )
    expect(comTrava.headers.get('Content-Security-Policy')).toBe(
      "frame-ancestors 'none'"
    )
  })

  test('public/_headers manda os mesmos headers para todo arquivo estático', () => {
    const headers = readFileSync(
      new URL('../../public/_headers', import.meta.url),
      'utf8'
    )
    const lines = Object.entries(SECURITY_HEADERS)
      .map(([name, value]) => `  ${name}: ${value}\n`)
      .join('')
    expect(headers).toContain(
      `/*\n  Strict-Transport-Security: ${HSTS}\n${lines}`
    )
  })
})
