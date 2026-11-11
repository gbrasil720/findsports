import { describe, expect, test } from 'bun:test'
import {
  deviceLabel,
  lastSeen,
  listJoin,
  preferenceSummary,
  totpSecret
} from './settings'

const sentence = (parts: ReturnType<typeof preferenceSummary>) =>
  parts.map((p) => (p.strong ? `[${p.text}]` : p.text)).join('')

describe('configurações (11f–11i)', () => {
  test('frase das preferências como no design', () => {
    expect(
      sentence(
        preferenceSummary({
          sports: ['Futebol', 'Basquete', 'Fórmula 1'],
          teams: ['Corinthians'],
          radiusKm: 5,
          place: 'Vila Madalena'
        })
      )
    ).toBe(
      'Você acompanha [futebol, basquete e F1], torce para [Corinthians] e procura bares a até [5 km] de [Vila Madalena].'
    )
  })

  test('sem times nem lugar, a frase encurta', () => {
    expect(
      sentence(
        preferenceSummary({
          sports: ['MMA/UFC'],
          teams: [],
          radiusKm: 3,
          place: null
        })
      )
    ).toBe('Você acompanha [MMA/UFC] e procura bares a até [3 km].')
    expect(listJoin(['a', 'b'])).toBe('a e b')
  })

  test('aparelho da sessão pelo User-Agent', () => {
    expect(
      deviceLabel(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36'
      )
    ).toEqual({ name: 'Chrome no Mac', computer: true })
    expect(
      deviceLabel(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
      )
    ).toEqual({ name: 'Safari no iPhone', computer: false })
    expect(deviceLabel('Expo/57.0.9 CFNetwork/3860 Darwin/27.0.0').name).toBe(
      'App no iPhone'
    )
    expect(deviceLabel(null).name).toBe('Outro aparelho')
  })

  test('quando a sessão foi usada', () => {
    const now = new Date('2026-10-20T23:00:00Z').getTime() // 20h em SP
    expect(lastSeen(new Date(now - 60_000), now)).toBe('agora')
    expect(lastSeen('2026-10-20T15:30:00Z', now)).toBe('hoje, 12:30')
    expect(lastSeen('2026-10-20T02:10:00Z', now)).toBe('ontem, 23:10')
    expect(lastSeen('2026-10-12T15:00:00Z', now)).toBe('12 out')
  })
})

test('chave do autenticador em blocos de quatro', () => {
  expect(
    totpSecret(
      'otpauth://totp/Onside:ana%40x.com?secret=JBSWY3DPEHPK3PXP&issuer=Onside&digits=6'
    )
  ).toBe('JBSW Y3DP EHPK 3PXP')
  expect(totpSecret('otpauth://totp/x?issuer=Onside')).toBe('')
})
