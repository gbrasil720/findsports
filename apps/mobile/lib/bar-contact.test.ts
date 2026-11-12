import { describe, expect, test } from 'bun:test'
import { phoneLabel, whatsappUrl } from './bar-contact'

describe('phoneLabel', () => {
  test('celular e fixo, com ou sem +55', () => {
    expect(phoneLabel('+5511988776655')).toBe('(11) 98877-6655')
    expect(phoneLabel('11988776655')).toBe('(11) 98877-6655')
    expect(phoneLabel('1132104455')).toBe('(11) 3210-4455')
  })
  test('de fora ou estranho sai como veio', () => {
    expect(phoneLabel('+351912345678')).toBe('+351912345678')
    expect(phoneLabel('123')).toBe('123')
  })
})

describe('whatsappUrl', () => {
  test('local ganha o 55; com código de país passa', () => {
    expect(whatsappUrl('11988776655')).toBe('https://wa.me/5511988776655')
    expect(whatsappUrl('+55 (11) 98877-6655')).toBe(
      'https://wa.me/5511988776655'
    )
  })
  test('número que o WhatsApp não resolve fica sem link', () => {
    expect(whatsappUrl('123')).toBeNull()
  })
})
