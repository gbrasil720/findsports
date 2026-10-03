import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

import { HSTS, withHsts } from './hsts'

describe('HSTS no Worker', () => {
  test('resposta dinâmica sai com HSTS e mantém status, headers e corpo', async () => {
    const original = Response.redirect('https://www.onside.sh/login', 307)
    const response = withHsts(original)
    expect(response.status).toBe(307)
    expect(response.headers.get('Location')).toBe('https://www.onside.sh/login')
    expect(response.headers.get('Strict-Transport-Security')).toBe(HSTS)

    const page = withHsts(new Response('ok', { headers: { 'X-A': '1' } }))
    expect(page.headers.get('X-A')).toBe('1')
    expect(await page.text()).toBe('ok')
  })

  test('public/_headers manda o mesmo HSTS para todo arquivo estático', () => {
    const headers = readFileSync(
      new URL('../../public/_headers', import.meta.url),
      'utf8'
    )
    expect(headers).toContain(`/*\n  Strict-Transport-Security: ${HSTS}\n`)
  })
})
