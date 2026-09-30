import { describe, expect, it } from 'bun:test'
import { isCronAuthorized } from './retention-cron'

describe('isCronAuthorized (WEB-117)', () => {
  const secret = 'segredo-de-cron-com-tamanho'

  it('aceita só o Bearer exato do segredo', () => {
    expect(isCronAuthorized(`Bearer ${secret}`, secret)).toBe(true)
    expect(isCronAuthorized(secret, secret)).toBe(false)
    expect(isCronAuthorized(`Bearer ${secret}x`, secret)).toBe(false)
    expect(isCronAuthorized(null, secret)).toBe(false)
  })

  it('recusa tudo quando o segredo não está configurado', () => {
    expect(isCronAuthorized('Bearer ', undefined)).toBe(false)
    expect(isCronAuthorized('Bearer undefined', undefined)).toBe(false)
  })
})
