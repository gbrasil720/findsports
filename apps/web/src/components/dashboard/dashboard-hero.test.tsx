import { describe, expect, test } from 'bun:test'
import { JSDOM } from 'jsdom'
import { renderToStaticMarkup } from 'react-dom/server'

import type { LocationState } from '@/domain/discovery'
import { DashboardHero } from './dashboard-hero'

function renderizar(locationState: LocationState) {
  const markup = renderToStaticMarkup(
    <DashboardHero
      isLoading={false}
      count={2}
      radiusKm={5}
      locationState={locationState}
      fallbackCityName="São Paulo"
      onRequestLocation={() => {}}
    />
  )
  return new JSDOM(markup).window.document
}

const status = (documento: Document) =>
  documento.querySelector('[aria-live="polite"]')

const botao = (documento: Document) =>
  Array.from(documento.querySelectorAll('button')).find(
    (elemento) => elemento.textContent?.trim() === 'Usar minha localização'
  )

describe('de onde a busca parte', () => {
  test('sem localização, diz à vista que parte do centro da cidade', () => {
    const documento = renderizar('idle')
    expect(status(documento)?.textContent).toBe(
      '2 bares a até 5 km do centro de São Paulo'
    )
    expect(status(documento)?.className).not.toContain('sr-only')
    expect(botao(documento)).toBeDefined()
  })

  test('negada ou indisponível também oferece a localização', () => {
    expect(botao(renderizar('denied'))).toBeDefined()
    expect(botao(renderizar('unavailable'))).toBeDefined()
  })

  test('com localização, sem botão', () => {
    const documento = renderizar('granted')
    expect(status(documento)?.textContent).toBe('2 bares perto de você')
    expect(botao(documento)).toBeUndefined()
  })

  // Antes de o navegador responder, o botão piscaria para quem já liberou.
  test('enquanto o navegador não responde, sem botão', () => {
    expect(botao(renderizar('unknown'))).toBeUndefined()
    expect(botao(renderizar('requesting'))).toBeUndefined()
  })
})
