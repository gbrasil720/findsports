import { describe, expect, test } from 'bun:test'
import {
  isReservationCodeComplete,
  isReservationCodeShaped,
  normalizeReservationCode
} from './reservation-code'

describe('normalizeReservationCode', () => {
  test('ignora caixa, espaço e separador', () => {
    expect(normalizeReservationCode(' ab3-k9 x ')).toBe('AB3K9X')
    expect(normalizeReservationCode('ab3.k9_x')).toBe('AB3K9X')
  })

  test('não inventa caractere: o que não é separador continua lá', () => {
    expect(normalizeReservationCode('ab3k9ç')).toBe('AB3K9Ç')
  })
})

describe('isReservationCodeComplete', () => {
  test('só o tamanho das casas da página, no formato da coluna', () => {
    expect(isReservationCodeComplete('AB3K9X')).toBe(true)
    expect(isReservationCodeComplete('AB3K9')).toBe(false)
    expect(isReservationCodeComplete('AB3K9XZ')).toBe(false)
    expect(isReservationCodeComplete('ab3k9x')).toBe(false)
    expect(isReservationCodeComplete('AB3K9Ç')).toBe(false)
  })
})

describe('isReservationCodeShaped', () => {
  test('aceita o formato do CHECK da coluna', () => {
    expect(isReservationCodeShaped('AB3K')).toBe(true)
    expect(isReservationCodeShaped('A'.repeat(12))).toBe(true)
  })

  test('recusa curto, longo, minúscula e símbolo', () => {
    expect(isReservationCodeShaped('AB3')).toBe(false)
    expect(isReservationCodeShaped('A'.repeat(13))).toBe(false)
    expect(isReservationCodeShaped('ab3k')).toBe(false)
    expect(isReservationCodeShaped('AB3K9Ç')).toBe(false)
    expect(isReservationCodeShaped('')).toBe(false)
  })
})
