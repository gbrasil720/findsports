import { describe, expect, it } from 'bun:test'

import { chaveDeIp, extrairIp } from './client-ip'

describe('chaveDeIp', () => {
  it('mantém IPv4 e unknown', () => {
    expect(chaveDeIp('203.0.113.10')).toBe('203.0.113.10')
    expect(chaveDeIp('unknown')).toBe('unknown')
  })

  it('reduz IPv6 ao /64, com e sem ::', () => {
    expect(chaveDeIp('2001:db8:1:2:aaaa:bbbb:cccc:dddd')).toBe(
      '2001:db8:1:2::/64'
    )
    expect(chaveDeIp('2001:DB8:1:2::1')).toBe('2001:db8:1:2::/64')
    expect(chaveDeIp('2001:db8::1')).toBe('2001:db8:0:0::/64')
    expect(chaveDeIp('::1')).toBe('0:0:0:0::/64')
    expect(chaveDeIp('fe80::1%eth0')).toBe('fe80:0:0:0::/64')
  })

  it('dois endereços do mesmo /64 dão a mesma chave', () => {
    expect(chaveDeIp('2001:db8:1:2::a')).toBe(chaveDeIp('2001:db8:1:2:ffff::b'))
    expect(chaveDeIp('2001:db8:1:2::a')).not.toBe(chaveDeIp('2001:db8:1:3::a'))
  })

  it('IPv4 mapeado vira o IPv4', () => {
    expect(chaveDeIp('::ffff:1.2.3.4')).toBe('1.2.3.4')
    expect(chaveDeIp('::ffff:102:304')).toBe('1.2.3.4')
  })

  it('o que não é IPv6 válido sai como veio', () => {
    expect(chaveDeIp('1::2::3')).toBe('1::2::3')
    expect(chaveDeIp('1:2:3:4:5:6:7:8:9')).toBe('1:2:3:4:5:6:7:8:9')
    expect(chaveDeIp('::ffff:1.2.3.999')).toBe('::ffff:1.2.3.999')
    expect(chaveDeIp('zz::1')).toBe('zz::1')
  })
})

describe('extrairIp', () => {
  it('devolve o /64 do cf-connecting-ip no Workers', () => {
    const headers = new Headers({ 'cf-connecting-ip': ' 2001:db8:1:2::99 ' })
    expect(extrairIp(headers, true)).toBe('2001:db8:1:2::/64')
    expect(extrairIp(new Headers(), true)).toBe('unknown')
  })
})
