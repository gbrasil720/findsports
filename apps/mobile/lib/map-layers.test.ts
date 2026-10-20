import { describe, expect, test } from 'bun:test'
import {
  buildIndex,
  expandGroup,
  labelBudget,
  type MapBar,
  mapLayers,
  zoomOf
} from './map-layers'

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

const layersOf = (
  bars: MapBar[],
  region: typeof NEAR,
  selectedId: string | null = null
) =>
  mapLayers(
    buildIndex(bars.filter((b) => b.id !== selectedId)),
    bars.find((b) => b.id === selectedId) ?? null,
    region,
    SIZE
  )

describe('mapa sem amontoado (20d)', () => {
  test('perto, separados: todos viram rótulo', () => {
    const layers = layersOf(
      [bar('a', -23.555, -46.685), bar('b', -23.565, -46.675)],
      NEAR
    )
    expect(kinds(layers)).toEqual({ a: 'label', b: 'label' })
  })

  test('longe: bares colados viram grupo com o selo de ao vivo', () => {
    const layers = layersOf(
      [
        bar('a', -23.56, -46.68, { live: true }),
        bar('b', -23.5605, -46.6805),
        bar('c', -23.59, -46.64)
      ],
      FAR
    )
    const group = layers.find((l) => l.kind === 'group')
    expect(group).toMatchObject({ count: 2, live: 1 })
    // Longe não tem rótulo: o que sobra é ponto.
    expect(layers.find((l) => l.id === 'c')?.kind).toBe('point')
  })

  test('rótulos que encostam: o de menor prioridade vira ponto', () => {
    // A 70 pt um do outro: não agrupa, mas os rótulos se cruzam.
    const dx = (70 / SIZE.width) * NEAR.longitudeDelta
    const layers = layersOf(
      [
        bar('perto', -23.56, -46.68, { distanceKm: 0.5 }),
        bar('vivo', -23.56, -46.68 + dx, { live: true, distanceKm: 2 })
      ],
      NEAR
    )
    expect(kinds(layers)).toEqual({ vivo: 'label', perto: 'point' })
  })

  test('bar tocado fica selecionado e os outros, pontos', () => {
    const layers = layersOf(
      [bar('a', -23.555, -46.685), bar('b', -23.565, -46.675)],
      NEAR,
      'b'
    )
    expect(kinds(layers)).toEqual({ a: 'point', b: 'selected' })
  })

  test('tocar no grupo abre no zoom em que ele se separa', () => {
    const bars = [bar('a', -23.56, -46.68), bar('b', -23.5605, -46.6805)]
    const index = buildIndex(bars)
    const [group] = mapLayers(index, null, FAR, SIZE)
    if (group?.kind !== 'group') throw new Error('sem grupo')
    const next = expandGroup(index, group, FAR, SIZE.width)
    expect(zoomOf(next, SIZE.width)).toBeGreaterThan(zoomOf(FAR, SIZE.width))
    const after = mapLayers(index, null, next, SIZE)
    expect(after.every((l) => l.kind !== 'group')).toBe(true)
  })

  test('debaixo do cabeçalho não ganha rótulo', () => {
    const layers = mapLayers(
      buildIndex([bar('alto', -23.547, -46.68)]),
      null,
      NEAR,
      SIZE,
      200
    )
    expect(kinds(layers)).toEqual({ alto: 'point' })
  })

  test('orçamento de rótulos por zoom', () => {
    expect(labelBudget(FAR)).toBe(0)
    expect(labelBudget({ ...NEAR, longitudeDelta: 0.04 })).toBe(3)
    expect(labelBudget(NEAR)).toBe(Number.POSITIVE_INFINITY)
  })
})
