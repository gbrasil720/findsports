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
  reservationsSoldOut: false,
  isOwner: false
}

describe('BarActions', () => {
  test('com reserva disponível, "Reservar mesa" é o primário e o WhatsApp continua', () => {
    const markup = renderToStaticMarkup(
      <BarActions {...base} onReserve={() => {}} variant="panel" />
    )
    expect(markup).toContain('Reservar mesa')
    expect(markup).toContain('WhatsApp')
    expect(markup).not.toContain('Falar com o bar')
    expect(markup).toContain('Garanta seu lugar')
  })

  // WEB-353: o título não promete lugar quando não há reserva a fazer.
  test('sem reserva, o título é "Fale com o bar", inclusive com reservas esgotadas', () => {
    for (const reservationsSoldOut of [false, true]) {
      const markup = renderToStaticMarkup(
        <BarActions
          {...base}
          onReserve={null}
          reservationsSoldOut={reservationsSoldOut}
          variant="panel"
        />
      )
      expect(markup).toContain('Fale com o bar')
      expect(markup).not.toContain('Garanta seu lugar')
    }
  })

  test('sem reserva, volta ao WhatsApp e à rota, sem botão de reserva', () => {
    const markup = renderToStaticMarkup(
      <BarActions {...base} onReserve={null} variant="panel" />
    )
    expect(markup).not.toContain('Reservar mesa')
    expect(markup).toContain('Falar com o bar')
    expect(markup).toContain('Rota')
  })

  test('esgotado toma o lugar de "Reservar mesa", sem clique, e os contatos continuam', () => {
    const markup = renderToStaticMarkup(
      <BarActions
        {...base}
        onReserve={null}
        reservationsSoldOut
        variant="panel"
      />
    )
    expect(markup).not.toContain('Reservar mesa')
    expect(markup).toMatch(
      /<button[^>]*disabled[^>]*>.*Reservas esgotadas para este jogo/
    )
    expect(markup).toContain('WhatsApp')
    expect(markup).toContain('Rota')
  })
})
