import { describe, expect, test } from 'bun:test'
import {
  buildIndex,
  expandGroup,
  hoodNames,
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
  test('perto: rótulo só para ao vivo e Elite; o resto é ponto (20b)', () => {
    const layers = layersOf(
      [
        bar('vivo', -23.555, -46.685, { live: true }),
        bar('elite', -23.565, -46.675, { elite: true }),
        bar('comum', -23.552, -46.672)
      ],
      NEAR
    )
    expect(kinds(layers)).toEqual({
      vivo: 'label',
      elite: 'label',
      comum: 'point'
    })
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
        bar('perto', -23.56, -46.68, { elite: true, distanceKm: 0.5 }),
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

  test('tocar no grupo abre no zoom de rua, onde os bares se separam', () => {
    // A ~400 m um do outro: juntos de longe, separados na rua.
    const bars = [bar('a', -23.56, -46.68), bar('b', -23.563, -46.683)]
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
      buildIndex([bar('alto', -23.547, -46.68, { live: true })]),
      null,
      NEAR,
      SIZE,
      200
    )
    expect(kinds(layers)).toEqual({ alto: 'point' })
  })

  test('nome de bairro só longe e onde não encosta em nada', () => {
    const bars = [bar('a', -23.56, -46.68), bar('b', -23.5605, -46.6805)]
    const hood = (b: MapBar, n: string) => ({ ...b, neighborhood: n })
    const named = [
      hood(bars[0] as MapBar, 'Pinheiros'),
      hood(bars[1] as MapBar, 'Pinheiros')
    ]
    const far = mapLayers(buildIndex(bars), null, FAR, SIZE)
    // O nome desvia do grupo: sai, mas não em cima dele.
    const [moved] = hoodNames(named, far, FAR, SIZE)
    const group = far.find((l) => l.kind === 'group')
    expect(moved?.name).toBe('Pinheiros')
    expect(group && moved && Math.abs(moved.lat - group.lat)).toBeGreaterThan(
      0.005
    )
    // Sem nada por perto, sai; no zoom de rua, não.
    expect(hoodNames(named, [], FAR, SIZE).map((h) => h.name)).toEqual([
      'Pinheiros'
    ])
    expect(hoodNames(named, [], NEAR, SIZE)).toEqual([])
  })

  test('orçamento de rótulos por zoom', () => {
    expect(labelBudget(FAR)).toBe(0)
    expect(labelBudget(NEAR)).toBe(3)
    expect(labelBudget({ ...NEAR, longitudeDelta: 0.01 })).toBe(
      Number.POSITIVE_INFINITY
    )
  })
})
