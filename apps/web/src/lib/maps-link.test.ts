import { describe, expect, it } from 'bun:test'
import { buildDirectionsUrl } from './maps-link'

describe('buildDirectionsUrl', () => {
  it('usa as coordenadas geocodificadas', () => {
    const url = buildDirectionsUrl({
      latitude: '-23.6109',
      longitude: '-46.6953'
    })

    expect(url).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=-23.6109,-46.6953'
    )
  })

  it('cai para nome e endereço quando a coordenada não é número', () => {
    const url = buildDirectionsUrl({
      latitude: 'nan',
      longitude: '',
      name: 'Pastel do Theo',
      address: 'Rua Barão do Triunfo 142'
    })

    expect(url).toContain('destination=Pastel%20do%20Theo')
    expect(url).toContain('Bar%C3%A3o')
  })

  it('devolve null quando não há destino algum', () => {
    expect(buildDirectionsUrl({ latitude: '', longitude: '' })).toBeNull()
  })
})
