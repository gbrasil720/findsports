import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'

import { BarActions } from './bar-action-bar'

const base = {
  whatsappUrl: 'https://wa.me/5511999999999',
  directionsUrl: 'https://maps.example/rota',
  phone: '+5511999999999',
  onWhatsApp: () => {},
  onDirections: () => {},
  onPhone: () => {},
  isOwner: false
}

describe('BarActions', () => {
  test('o título é "Fale com o bar", sem prometer lugar', () => {
    const markup = renderToStaticMarkup(
      <BarActions {...base} variant="panel" />
    )
    expect(markup).toContain('Fale com o bar')
    expect(markup).not.toContain('Garanta seu lugar')
    expect(markup).not.toContain('Reservar mesa')
  })

  // Sem WhatsApp e sem telefone não há como falar: o título descreve a rota.
  test('sem contato, o título é "Como chegar" em vez de "Fale com o bar"', () => {
    const markup = renderToStaticMarkup(
      <BarActions {...base} whatsappUrl={null} phone={null} variant="panel" />
    )
    expect(markup).toContain('<p class="onside-kicker">Como chegar</p>')
    expect(markup).not.toContain('Fale com o bar')
  })

  test('com WhatsApp ou só telefone, o título segue "Fale com o bar"', () => {
    for (const contact of [{ phone: null }, { whatsappUrl: null }]) {
      const markup = renderToStaticMarkup(
        <BarActions {...base} {...contact} variant="panel" />
      )
      expect(markup).toContain('<p class="onside-kicker">Fale com o bar</p>')
    }
  })

  test('o WhatsApp é o primário, com a rota ao lado', () => {
    const markup = renderToStaticMarkup(
      <BarActions {...base} variant="panel" />
    )
    expect(markup).toContain('Falar com o bar')
    expect(markup).toContain('Rota')
  })

  // WEB-370: três botões com texto não cabem na barra do celular.
  test('na barra, dois secundários ou mais ficam só com ícone', () => {
    const bar = (props: object) =>
      renderToStaticMarkup(<BarActions {...base} {...props} variant="bar" />)
    const three = bar({})
    expect(three).toContain('<span>Falar com o bar</span>')
    expect(three).toContain('<span class="sr-only">Rota</span>')
    expect(three).toContain('<span class="sr-only">Ligar</span>')
    // Com um secundário só, o texto dele cabe.
    expect(bar({ whatsappUrl: null })).toContain(
      '<span class="ml-2">Ligar</span>'
    )
  })
})
