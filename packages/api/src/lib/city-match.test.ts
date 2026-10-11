import { describe, expect, it } from 'bun:test'

import { normalizarCidade } from './city-match'

describe('comparação de cidade', () => {
  it('ignora acento, caixa e espaço repetido', () => {
    expect(normalizarCidade('São  PAULO ')).toBe('sao paulo')
    expect(normalizarCidade('sao paulo')).toBe('sao paulo')
    expect(normalizarCidade('Vitória')).toBe(normalizarCidade('VITORIA'))
  })
})
