import { expect, it } from 'bun:test'

import { distanciaMetros } from './regeocode-bars'

it('mede em metros a distância entre coordenadas gravadas em texto', () => {
  const paulista = { latitude: '-23.5614', longitude: '-46.6559' }
  expect(distanciaMetros(paulista, paulista)).toBe(0)
  // 0,001° de latitude ≈ 111 m.
  expect(
    Math.round(
      distanciaMetros(paulista, { latitude: '-23.5624', longitude: '-46.6559' })
    )
  ).toBe(111)
})
