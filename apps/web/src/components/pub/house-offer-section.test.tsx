import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'

import { HouseOfferSection } from './house-offer-section'

describe('HouseOfferSection', () => {
  test('bar sem oferta não desenha seção vazia', () => {
    expect(renderToStaticMarkup(<HouseOfferSection offer={null} />)).toBe('')
    expect(renderToStaticMarkup(<HouseOfferSection offer="" />)).toBe('')
  })

  test('mostra o texto do bar com a ressalva de quem promete', () => {
    const markup = renderToStaticMarkup(
      <HouseOfferSection offer="Chopp em dobro no intervalo" />
    )
    expect(markup).toContain('Oferta da casa')
    expect(markup).toContain('Chopp em dobro no intervalo')
    expect(markup).toContain('definida e cumprida pelo estabelecimento')
  })
})
