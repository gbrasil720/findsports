import { describe, expect, test } from 'bun:test'
import { labelBudget, type MapBar, mapLayers, zoomInto } from './map-layers'

const SIZE = { width: 390, height: 600 }
// ~2 km de largura: perto.
const NEAR = {
  latitude: -23.56,
  longitude: -46.68,
  latitudeDelta: 0.03,
  longitudeDelta: 0.02
}
// ~10 km: longe.
const FAR = { ...NEAR, latitudeDelta: 0.15, longitudeDelta: 0.1 }

const bar = (
  id: string,
  lat: number,
  lng: number,
  extra: Partial<MapBar> = {}
): MapBar => ({
  id,
  name: id,
  lat,
  lng,
  live: false,
  elite: false,
  distanceKm: 1,
  next: 0,
  label: `Bar ${id}`,
  ...extra
})

const kinds = (layers: ReturnType<typeof mapLayers>) =>
  Object.fromEntries(layers.map((l) => [l.id, l.kind]))

describe('mapa sem amontoado (20d)', () => {
  test('perto, separados: todos viram rótulo', () => {
    const layers = mapLayers(
      [bar('a', -23.555, -46.685), bar('b', -23.565, -46.675)],
      NEAR,
      SIZE,
      null
    )
    expect(kinds(layers)).toEqual({ a: 'label', b: 'label' })
  })

  test('longe: bares colados viram grupo com o selo de ao vivo', () => {
    const layers = mapLayers(
      [
        bar('a', -23.56, -46.68, { live: true }),
        bar('b', -23.5605, -46.6805),
        bar('c', -23.6, -46.64)
      ],
      FAR,
      SIZE,
      null
    )
    const group = layers.find((l) => l.kind === 'group')
    expect(group).toMatchObject({ count: 2, live: 1 })
    // Longe não tem rótulo: o que sobra é ponto.
    expect(layers.find((l) => l.id === 'c')?.kind).toBe('point')
  })

  test('rótulos que encostam: o de menor prioridade vira ponto', () => {
    // A 70 px um do outro: não agrupa, mas os rótulos se cruzam.
    const dx = (70 / SIZE.width) * NEAR.longitudeDelta
    const layers = mapLayers(
      [
        bar('perto', -23.56, -46.68, { distanceKm: 0.5 }),
        bar('vivo', -23.56, -46.68 + dx, { live: true, distanceKm: 2 })
      ],
      NEAR,
      SIZE,
      null
    )
    expect(kinds(layers)).toEqual({ vivo: 'label', perto: 'point' })
  })

  test('bar tocado fica selecionado e os outros, pontos', () => {
    const layers = mapLayers(
      [bar('a', -23.555, -46.685), bar('b', -23.565, -46.675)],
      NEAR,
      SIZE,
      'b'
    )
    expect(kinds(layers)).toEqual({ a: 'point', b: 'selected' })
  })

  test('orçamento de rótulos por zoom e aproximar o grupo', () => {
    expect(labelBudget(FAR)).toBe(0)
    expect(labelBudget({ ...NEAR, longitudeDelta: 0.04 })).toBe(3)
    expect(labelBudget(NEAR)).toBe(Number.POSITIVE_INFINITY)
    expect(zoomInto({ lat: 1, lng: 2 }, FAR).longitudeDelta).toBeCloseTo(
      0.0333,
      3
    )
  })
})
