import { describe, expect, it } from 'bun:test'

import { criarCirculoDeRaio } from './geo-circle'

const SAO_PAULO = { lat: -23.5505, lng: -46.6333 }
const RAIO_DA_TERRA_KM = 6371.0088

/** Haversine: a distância real entre dois pontos, em quilômetros. */
function distanciaKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const rad = (g: number) => (g * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * RAIO_DA_TERRA_KM * Math.asin(Math.sqrt(h))
}

describe('círculo de raio (WEB-73)', () => {
  it('fecha o anel, como o GeoJSON exige', () => {
    const anel = criarCirculoDeRaio(SAO_PAULO, 5).geometry.coordinates[0]
    expect(anel).toHaveLength(65)
    expect(anel[0]).toEqual(anel[64] as [number, number])
  })

  it('todo vértice fica à distância pedida do centro', () => {
    for (const raioKm of [1, 3, 5, 10]) {
      const anel = criarCirculoDeRaio(SAO_PAULO, raioKm).geometry.coordinates[0]
      for (const [lng, lat] of anel) {
        // Um metro de folga cobre o arredondamento de ponto flutuante; o erro
        // de 64 lados não aparece aqui, porque os vértices ficam sobre o
        // círculo — quem fica dentro é a corda entre eles.
        expect(distanciaKm({ lat, lng }, SAO_PAULO)).toBeCloseTo(raioKm, 3)
      }
    }
  })

  it('é geodésico, não uma elipse em graus', () => {
    // Em São Paulo um grau de longitude é ~8% mais curto que um de latitude.
    // Um círculo desenhado em graus sairia achatado; um geodésico compensa,
    // então o span em longitude é MAIOR que o span em latitude.
    const anel = criarCirculoDeRaio(SAO_PAULO, 10).geometry.coordinates[0]
    const lats = anel.map(([, lat]) => lat)
    const lngs = anel.map(([lng]) => lng)
    const spanLat = Math.max(...lats) - Math.min(...lats)
    const spanLng = Math.max(...lngs) - Math.min(...lngs)
    expect(spanLng / spanLat).toBeCloseTo(
      1 / Math.cos((23.5505 * Math.PI) / 180),
      2
    )
  })

  it('mantém a longitude em [-180, 180] perto do antimeridiano', () => {
    const anel = criarCirculoDeRaio({ lat: 0, lng: 179.99 }, 10).geometry
      .coordinates[0]
    for (const [lng] of anel) {
      expect(lng).toBeGreaterThanOrEqual(-180)
      expect(lng).toBeLessThanOrEqual(180)
    }
  })
})
