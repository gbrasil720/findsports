import { describe, expect, it } from 'bun:test'

import { extrairIp } from './lib/client-ip'

describe('extrairIp', () => {
  it('usa o primeiro hop de x-forwarded-for', () => {
    const headers = new Headers({
      'x-forwarded-for': ' 203.0.113.10, 10.0.0.1 '
    })
    expect(extrairIp(headers)).toBe('203.0.113.10')
  })

  it('cai para x-real-ip e depois unknown', () => {
    expect(extrairIp(new Headers({ 'x-real-ip': '198.51.100.2' }))).toBe(
      '198.51.100.2'
    )
    expect(extrairIp(new Headers())).toBe('unknown')
  })
})
