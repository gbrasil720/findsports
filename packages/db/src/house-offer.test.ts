import { describe, expect, test } from 'bun:test'
import {
  HOUSE_OFFER_MAX_LENGTH,
  houseOfferLength,
  normalizeHouseOffer
} from './house-offer'

describe('normalizeHouseOffer', () => {
  test('tira espaço das pontas e junta espaços e quebras de linha', () => {
    expect(normalizeHouseOffer('  Chopp   em dobro\n\nno intervalo ')).toBe(
      'Chopp em dobro no intervalo'
    )
  })

  test.each([
    null,
    undefined,
    '',
    '   ',
    '\n\t'
  ])('trata %p como oferta limpa', (input) => {
    expect(normalizeHouseOffer(input)).toBeNull()
  })
})

describe('houseOfferLength', () => {
  test('conta caractere, não unidade UTF-16, como o char_length do CHECK', () => {
    expect(houseOfferLength('🍺'.repeat(HOUSE_OFFER_MAX_LENGTH))).toBe(
      HOUSE_OFFER_MAX_LENGTH
    )
    expect(houseOfferLength(null)).toBe(0)
  })
})
