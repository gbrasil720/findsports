import { describe, expect, it } from 'bun:test'

import { cidadeLiberada, normalizarCidade } from './city-match'

describe('comparação de cidade (ESC-19)', () => {
  it('ignora acento, caixa e espaço repetido', () => {
    expect(normalizarCidade('São  PAULO ')).toBe('sao paulo')
    expect(normalizarCidade('sao paulo')).toBe('sao paulo')
    expect(normalizarCidade('Vitória')).toBe(normalizarCidade('VITORIA'))
  })

  /**
   * Lista vazia é o padrão da flag, e precisa significar o comportamento
   * anterior a ela: nenhuma restrição. Se significasse "nenhuma cidade", o
   * padrão trancaria todo cadastro de bar assim que a flag existisse.
   */
  it('lista vazia libera todas', () => {
    expect(cidadeLiberada('Qualquer Lugar', [])).toBe(true)
  })

  it('lista preenchida só libera quem está nela', () => {
    const abertas = ['São Paulo', 'Rio de Janeiro']
    expect(cidadeLiberada('sao  paulo', abertas)).toBe(true)
    expect(cidadeLiberada('RIO DE JANEIRO', abertas)).toBe(true)
    expect(cidadeLiberada('Curitiba', abertas)).toBe(false)
  })

  /**
   * Nada de casar por proximidade. Um bloqueio de lançamento que passa por
   * "quase igual" é impossível de explicar para quem foi barrado — e pior,
   * para quem passou sem dever passar.
   */
  it('não casa por prefixo nem por conter', () => {
    expect(cidadeLiberada('São Paulo de Potengi', ['São Paulo'])).toBe(false)
    expect(cidadeLiberada('São', ['São Paulo'])).toBe(false)
  })

  it('cidade em branco não passa quando há restrição', () => {
    expect(cidadeLiberada('   ', ['São Paulo'])).toBe(false)
  })
})
