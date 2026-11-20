import { describe, expect, test } from 'bun:test'

import {
  normalizeTrialAddress,
  normalizeTrialEmail,
  trialAddressHash,
  trialEmailHash
} from './trial-grant'

describe('normalizeTrialEmail', () => {
  test('minúsculas, espaços e +etiqueta', () => {
    expect(normalizeTrialEmail('  Ana.Silva+bar2@Onside.sh ')).toBe(
      'ana.silva@onside.sh'
    )
  })

  test('Gmail sem pontos, googlemail vira gmail', () => {
    expect(normalizeTrialEmail('a.n.a+x@googlemail.com')).toBe('ana@gmail.com')
    expect(normalizeTrialEmail('A.na@gmail.com')).toBe('ana@gmail.com')
  })

  test('fora do Gmail os pontos ficam', () => {
    expect(normalizeTrialEmail('a.na@hotmail.com')).toBe('a.na@hotmail.com')
  })
})

describe('hashes', () => {
  test('mesmo e-mail normalizado, mesmo hash; outro, outro', () => {
    expect(trialEmailHash('ana+1@gmail.com')).toBe(
      trialEmailHash('A.NA@gmail.com')
    )
    expect(trialEmailHash('ana@gmail.com')).not.toBe(
      trialEmailHash('bia@gmail.com')
    )
    expect(trialEmailHash('ana@gmail.com')).not.toContain('ana')
  })

  test('endereço sem acento, caixa nem pontuação', () => {
    const a = { address: 'Rua Aspicuelta, 123', city: 'São Paulo', uf: 'SP' }
    const b = { address: 'rua  aspicuelta 123', city: 'SAO PAULO', uf: 'sp' }
    expect(normalizeTrialAddress(a)).toBe('rua aspicuelta 123|sao paulo|sp')
    expect(trialAddressHash(a)).toBe(trialAddressHash(b))
    expect(trialAddressHash(a)).not.toBe(
      trialAddressHash({ ...a, address: 'Rua Aspicuelta, 124' })
    )
  })
})
