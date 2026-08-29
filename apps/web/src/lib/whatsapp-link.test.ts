import { describe, expect, it } from 'bun:test'
import {
  buildWhatsAppLink,
  buildWhatsAppMessage,
  toWhatsAppNumber
} from './whatsapp-link'

describe('toWhatsAppNumber', () => {
  it('acrescenta o código do país a celular brasileiro sem DDI', () => {
    expect(toWhatsAppNumber('(11) 98844-6094')).toBe('5511988446094')
  })

  it('acrescenta o código do país a fixo de dez dígitos', () => {
    expect(toWhatsAppNumber('1133334444')).toBe('551133334444')
  })

  it('mantém número que já traz o DDI', () => {
    expect(toWhatsAppNumber('+55 11 98844-6094')).toBe('5511988446094')
  })

  it('recusa número curto demais para ser telefone', () => {
    expect(toWhatsAppNumber('9999')).toBeNull()
  })

  it('recusa string sem dígito nenhum', () => {
    expect(toWhatsAppNumber('não tenho')).toBeNull()
  })
})

describe('buildWhatsAppMessage', () => {
  it('nomeia o jogo quando existe', () => {
    const message = buildWhatsAppMessage({
      matchup: 'Palmeiras × Santos',
      when: 'hoje às 21:00'
    })

    expect(message).toContain('Palmeiras × Santos')
    expect(message).toContain('hoje às 21:00')
    expect(message).toContain('mesa')
  })

  it('tem versão sem jogo', () => {
    expect(buildWhatsAppMessage(null)).toContain('Onside')
  })
})

describe('buildWhatsAppLink', () => {
  it('monta o link com a mensagem codificada', () => {
    const link = buildWhatsAppLink({
      phone: '11988446094',
      acceptsWhatsapp: true,
      event: { matchup: 'Palmeiras × Santos', when: 'hoje às 21:00' }
    })

    expect(link).toStartWith('https://wa.me/5511988446094?text=')
    expect(decodeURIComponent(link ?? '')).toContain('Palmeiras × Santos')
  })

  it('não monta link sem consentimento de WhatsApp', () => {
    expect(
      buildWhatsAppLink({ phone: '11988446094', acceptsWhatsapp: false })
    ).toBeNull()
  })

  it('não monta link sem telefone', () => {
    expect(buildWhatsAppLink({ phone: null, acceptsWhatsapp: true })).toBeNull()
  })

  it('não monta link com telefone impossível', () => {
    expect(
      buildWhatsAppLink({ phone: '123', acceptsWhatsapp: true })
    ).toBeNull()
  })
})
