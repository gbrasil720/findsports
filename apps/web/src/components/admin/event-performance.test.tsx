import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'

import type { EventAnalyticsRow } from './admin-model'
import { EventPerformance } from './event-performance'

const jogo = (values: Partial<EventAnalyticsRow> = {}): EventAnalyticsRow => ({
  eventId: 'jogo-1',
  eventName: 'Corinthians × Palmeiras',
  startsAt: '2026-10-08T22:00:00.000Z',
  uniqueVisitors: 8,
  interestedPeople: 4,
  profileViews: 10,
  directionsOpened: 3,
  phoneClicked: 2,
  whatsappOpened: 1,
  reservedPeople: 6,
  arrivals: 5,
  ...values
})

const renderizar = (
  item: EventAnalyticsRow,
  comparisonMode: 'previous_period' | 'cross_game' | 'advanced'
) =>
  renderToStaticMarkup(
    <EventPerformance
      eventAnalyticsState={{
        status: 'ready',
        items: [item],
        comparisonMode,
        onComparisonTargetChange: () => {},
        from: '2026-10-01',
        to: '2026-10-08'
      }}
    />
  )

describe('legenda da comparação (WEB-258)', () => {
  test('quem tem o recurso lê que ele é do próprio plano, não uma oferta', () => {
    const markup = renderizar(jogo(), 'advanced')
    expect(markup).toContain('Comparação entre jogos · recurso do seu plano')
    expect(markup).not.toContain('Comparação disponível no plano')
  })

  test('quem não tem o recurso não vê a legenda', () => {
    expect(renderizar(jogo(), 'previous_period')).not.toContain(
      'Comparação entre jogos'
    )
  })
})

describe('reservas e chegadas por jogo (WEB-323)', () => {
  test('plano com reserva de mesa vê os dois números do jogo', () => {
    const markup = renderizar(jogo(), 'advanced')
    expect(markup).toContain('<span class="sr-only">Reservas: </span>6')
    expect(markup).toContain('<span class="sr-only">Chegadas: </span>5')
    // ADR 0003: não entram na taxa, que continua interessados sobre quem viu.
    expect(markup).toContain('<span class="sr-only">Taxa: </span>50.0%')
  })

  // O servidor manda `null` para o plano sem reserva de mesa; a linha não
  // ganha coluna, e o painel expandido mostra o valor travado, nunca zero.
  test('plano sem reserva não ganha as colunas', () => {
    const markup = renderizar(
      jogo({ reservedPeople: null, arrivals: null }),
      'cross_game'
    )
    expect(markup).not.toContain('Reservas')
    expect(markup).not.toContain('Chegadas')
  })
})
