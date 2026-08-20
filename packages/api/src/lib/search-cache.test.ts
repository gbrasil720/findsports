import { describe, expect, it } from 'bun:test'

import { chaveBusca, chaveBuscaLocal } from './search-cache'

const MODO = 'camadas' as const

describe('chave de cache da busca', () => {
  it('arredonda coordenadas para a mesma célula de ~110 m', () => {
    const a = chaveBusca({
      modo: MODO,
      lat: -23.55012,
      lng: -46.63312,
      radiusKm: 3,
      limit: 20
    })
    const b = chaveBusca({
      modo: MODO,
      lat: -23.55044,
      lng: -46.63349,
      radiusKm: 3,
      limit: 20
    })
    expect(a).toBe(b)
  })

  it('trata listas de características equivalentes como a mesma chave', () => {
    const base = {
      modo: MODO,
      lat: -23.55,
      lng: -46.63,
      radiusKm: 3,
      limit: 20
    }

    // O roteador normaliza antes de montar a chave; esta asserção trava a
    // outra ponta: chaves iguais para listas iguais, chaves distintas para
    // filtros distintos.
    expect(chaveBusca({ ...base, amenities: [1, 4] })).toBe(
      chaveBusca({ ...base, amenities: [1, 4] })
    )
    expect(chaveBusca({ ...base, amenities: [1, 4] })).not.toBe(
      chaveBusca({ ...base, amenities: [1] })
    )
    expect(chaveBusca({ ...base, amenities: [1] })).not.toBe(chaveBusca(base))
  })

  it('não mistura raios, filtros nem página', () => {
    const base = {
      modo: MODO,
      lat: -23.55,
      lng: -46.63,
      radiusKm: 3 as const,
      limit: 20
    }
    const chaves = new Set([
      chaveBusca(base),
      chaveBusca({ ...base, radiusKm: 5 }),
      chaveBusca({ ...base, sportId: '11111111-1111-4111-8111-111111111111' }),
      chaveBusca({ ...base, championship: 'Brasileirão' }),
      chaveBusca({ ...base, championship: 'brasileirão' }),
      chaveBusca({ ...base, date: '2026-08-20' }),
      chaveBusca({ ...base, cursor: 'abc' }),
      chaveBusca({ ...base, limit: 10 })
    ])
    // campeonato só difere por caixa → mesma chave
    expect(chaves.size).toBe(7)
  })

  /**
   * ESC-19: os dois caminhos da busca devolvem o mesmo resultado, mas o
   * interruptor entre eles serve justamente para o caso em que um deles NÃO
   * está devolvendo. Chave compartilhada faria o desligamento demorar um TTL
   * a fazer efeito — o TTL inteiro servindo a página suspeita.
   */
  it('separa as páginas dos dois caminhos da busca', () => {
    const base = { lat: -23.55, lng: -46.63, radiusKm: 3 as const, limit: 20 }
    expect(chaveBusca({ ...base, modo: 'camadas' })).not.toBe(
      chaveBusca({ ...base, modo: 'linear' })
    )
  })

  it('busca só por localização também arredonda', () => {
    expect(
      chaveBuscaLocal({
        lat: -23.55012,
        lng: -46.63312,
        radiusKm: 5,
        limit: 20
      })
    ).toBe(
      chaveBuscaLocal({
        lat: -23.55044,
        lng: -46.63349,
        radiusKm: 5,
        limit: 20
      })
    )
  })
})
