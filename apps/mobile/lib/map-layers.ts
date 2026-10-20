import Supercluster from 'supercluster'

/*
 * Mapa sem amontoado (Rodada 20 do design, 20a a 20d): o que cada bar vira
 * na tela. Grupo (bares a menos de ~60 pt), ponto (o padrão) ou rótulo (só os
 * de maior prioridade que cabem sem encostar). O bar tocado é o selecionado.
 * Os grupos vêm da `supercluster`, por nível de zoom; o resto são contas
 * puras sobre a região visível. A tela fica em `app/(fan)/explore.tsx`.
 *
 * A camada nativa do mapa (MapLibre com `cluster: true` e colisão de
 * símbolos) faria o mesmo sem esta conta, mas sai do Expo Go: WEB-417.
 */

export type Region = {
  latitude: number
  longitude: number
  latitudeDelta: number
  longitudeDelta: number
}

export type MapBar = {
  id: string
  name: string
  lat: number
  lng: number
  live: boolean
  elite: boolean
  distanceKm: number
  /** Início do próximo jogo, em ms; `Infinity` sem jogo. */
  next: number
  /** O texto do rótulo ("Bar do Zé", "21:30"). */
  label: string
}

export type Layer =
  | {
      kind: 'group'
      id: string
      clusterId: number
      lat: number
      lng: number
      count: number
      live: number
    }
  | { kind: 'point' | 'label' | 'selected'; id: string; bar: MapBar }

/** Distância na tela, em pt, abaixo da qual os bares viram um grupo. */
export const GROUP_PT = 60

/** Ao vivo, depois Elite, depois o mais perto, depois o próximo jogo. */
export function byPriority(a: MapBar, b: MapBar) {
  return (
    Number(b.live) - Number(a.live) ||
    Number(b.elite) - Number(a.elite) ||
    a.distanceKm - b.distanceKm ||
    a.next - b.next
  )
}

/** Quantos km cabem na largura da tela nesta região. */
export const kmAcross = (r: Region) =>
  r.longitudeDelta * 111.32 * Math.cos((r.latitude * Math.PI) / 180)

/**
 * Bairro (mais de 4 km na tela, 20a): grupos e pontos, sem rótulo. Rua
 * (20b): até 3 rótulos. Mais perto que 1,5 km: rótulos em todos que couberem.
 */
export function labelBudget(r: Region) {
  const km = kmAcross(r)
  if (km > 4) return 0
  if (km > 1.5) return 3
  return Number.POSITIVE_INFINITY
}

/** O zoom da escala da web (tile de 256 pt) para a largura da tela. */
export const zoomOf = (r: Region, width: number) =>
  Math.log2((360 * width) / (256 * r.longitudeDelta))

type Props = { bar: MapBar }
type GroupProps = { live: number }

export type BarIndex = Supercluster<Props, GroupProps>

/**
 * O índice dos grupos. `extent` 512 por tile de 256 pt: o raio em unidades
 * do índice é o dobro do raio em pt.
 */
export function buildIndex(bars: MapBar[]): BarIndex {
  const index = new Supercluster<Props, GroupProps>({
    radius: GROUP_PT * 2,
    extent: 512,
    maxZoom: 19,
    map: (props) => ({ live: props.bar.live ? 1 : 0 }),
    reduce: (acc, props) => {
      acc.live += props.live
    }
  })
  index.load(
    bars.map((bar) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [bar.lng, bar.lat] },
      properties: { bar }
    }))
  )
  return index
}

type Box = { x1: number; y1: number; x2: number; y2: number }
const touches = (a: Box, b: Box) =>
  a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2

/** Caixa do rótulo: centrada acima do ponto, largura pelo texto. */
function labelBox(x: number, y: number, label: string): Box {
  const w = label.length * 7.2 + 30
  return { x1: x - w / 2, y1: y - 46, x2: x + w / 2, y2: y - 12 }
}

/**
 * O que desenhar. `index` é o dos bares sem o selecionado (que nunca entra
 * em grupo e fica por cima de tudo).
 */
export function mapLayers(
  index: BarIndex,
  selected: MapBar | null,
  region: Region,
  size: { width: number; height: number },
  /** Faixa coberta pelo cabeçalho e pelos chips: rótulo ali não se lê. */
  covered = 0,
  /** Onde a folha começa: rótulo atrás dela também não. */
  floor = size.height
): Layer[] {
  const left = region.longitude - region.longitudeDelta / 2
  const topLat = region.latitude + region.latitudeDelta / 2
  const at = (lat: number, lng: number) => ({
    x: ((lng - left) / region.longitudeDelta) * size.width,
    y: ((topLat - lat) / region.latitudeDelta) * size.height
  })
  // Um pouco além da borda: o bar que entra arrastando já vem desenhado.
  const pad = 0.25
  const features = index.getClusters(
    [
      left - region.longitudeDelta * pad,
      region.latitude - region.latitudeDelta * (0.5 + pad),
      left + region.longitudeDelta * (1 + pad),
      topLat + region.latitudeDelta * pad
    ],
    // Grupo só no zoom de bairro (20a); na rua já é tudo ponto ou rótulo
    // (20b, regra 04).
    labelBudget(region) === 0 ? Math.round(zoomOf(region, size.width)) : 20
  )

  const layers: Layer[] = []
  const taken: Box[] = []
  if (selected) {
    const p = at(selected.lat, selected.lng)
    taken.push(labelBox(p.x, p.y, selected.label))
  }
  const singles: MapBar[] = []
  for (const f of features) {
    const [lng = 0, lat = 0] = f.geometry.coordinates
    if ('cluster' in f.properties && f.properties.cluster) {
      const p = at(lat, lng)
      taken.push({ x1: p.x - 22, y1: p.y - 22, x2: p.x + 22, y2: p.y + 22 })
      layers.push({
        kind: 'group',
        id: `group:${f.properties.cluster_id}`,
        clusterId: f.properties.cluster_id,
        lat,
        lng,
        count: f.properties.point_count,
        live: f.properties.live
      })
    } else singles.push((f.properties as Props).bar)
  }

  // Rótulo só para ao vivo e Elite (20b), por prioridade, enquanto houver
  // vaga e não encostar; o resto é ponto. Com um bar tocado, nenhum outro
  // ganha rótulo.
  let budget = selected ? 0 : labelBudget(region)
  for (const bar of singles.sort(byPriority)) {
    const p = at(bar.lat, bar.lng)
    const box = labelBox(p.x, p.y, bar.label)
    if (
      budget > 0 &&
      (bar.live || bar.elite) &&
      box.y1 > covered &&
      box.y2 < floor &&
      box.x1 > 4 &&
      box.x2 < size.width - 4 &&
      !taken.some((t) => touches(t, box))
    ) {
      taken.push(box)
      budget -= 1
      layers.push({ kind: 'label', id: bar.id, bar })
    } else layers.push({ kind: 'point', id: bar.id, bar })
  }
  if (selected)
    layers.push({ kind: 'selected', id: selected.id, bar: selected })
  return layers
}

/**
 * A região que abre o grupo no zoom de rua (20b): os bares dele com folga,
 * uns 1,6 km na largura, ou mais perto se for preciso para se separarem.
 */
export function expandGroup(
  index: BarIndex,
  group: { clusterId: number; lat: number; lng: number },
  region: Region,
  width: number
): Region {
  const leaves = index
    .getLeaves(group.clusterId, Number.POSITIVE_INFINITY)
    .map((f) => f.properties.bar)
  const lats = leaves.map((b) => b.lat)
  const lngs = leaves.map((b) => b.lng)
  const lat = (Math.min(...lats) + Math.max(...lats)) / 2
  const lng = (Math.min(...lngs) + Math.max(...lngs)) / 2
  const cos = Math.cos((lat * Math.PI) / 180)
  const spanKm = Math.max(
    1.6,
    (Math.max(...lngs) - Math.min(...lngs)) * 111.32 * cos * 2.5,
    (Math.max(...lats) - Math.min(...lats)) * 111 * 2.5
  )
  // Nunca mais longe do que já estava, e perto o bastante para o grupo se
  // separar num toque só ("tocar aproxima até separar", 20d).
  const splitKm =
    (kmAcross(region) * 2 ** zoomOf(region, width)) /
    2 ** Math.min(index.getClusterExpansionZoom(group.clusterId), 19)
  const km = Math.min(spanKm, splitKm, kmAcross(region) / 2)
  const scale = kmAcross(region) / km
  return {
    latitude: lat,
    longitude: lng,
    latitudeDelta: region.latitudeDelta / scale,
    longitudeDelta: region.longitudeDelta / scale
  }
}

/**
 * Os nomes de bairro no zoom de bairro (20a): no meio dos bares de cada um,
 * em Anton apagado, só onde não encostam num grupo, num rótulo ou noutro
 * nome. No zoom de rua (20b) somem.
 */
export function hoodNames(
  bars: { neighborhood: string; lat: number; lng: number }[],
  layers: Layer[],
  region: Region,
  size: { width: number; height: number },
  covered = 0
) {
  // Só no zoom de bairro, o dos grupos (20a); no de rua (20b), não.
  if (labelBudget(region) !== 0) return []
  const left = region.longitude - region.longitudeDelta / 2
  const topLat = region.latitude + region.latitudeDelta / 2
  const at = (lat: number, lng: number) => ({
    x: ((lng - left) / region.longitudeDelta) * size.width,
    y: ((topLat - lat) / region.latitudeDelta) * size.height
  })
  const hoods = new Map<
    string,
    { name: string; lat: number; lng: number; n: number }
  >()
  for (const bar of bars) {
    const name = bar.neighborhood.trim()
    if (!name) continue
    const key = name.toLocaleLowerCase('pt-BR')
    const hood = hoods.get(key) ?? { name, lat: 0, lng: 0, n: 0 }
    hood.lat += bar.lat
    hood.lng += bar.lng
    hood.n += 1
    hoods.set(key, hood)
  }
  // O que já ocupa a tela: grupos, rótulos e pontos.
  const taken: Box[] = layers.map((l) => {
    const p = l.kind === 'group' ? at(l.lat, l.lng) : at(l.bar.lat, l.bar.lng)
    if (l.kind === 'group')
      return { x1: p.x - 34, y1: p.y - 34, x2: p.x + 34, y2: p.y + 34 }
    if (l.kind === 'point')
      return { x1: p.x - 18, y1: p.y - 18, x2: p.x + 18, y2: p.y + 18 }
    return labelBox(p.x, p.y, l.bar.label)
  })
  const out: { name: string; lat: number; lng: number }[] = []
  // Os bairros com mais bares primeiro.
  // Bairro de um bar só não ganha nome: ele cairia em cima do próprio ponto.
  for (const h of [...hoods.values()]
    .filter((h) => h.n > 1)
    .sort((a, b) => b.n - a.n)) {
    const lat = h.lat / h.n
    const lng = h.lng / h.n
    const p = at(lat, lng)
    const w = h.name.length * 8 + 8
    // Tenta acima, abaixo e dos lados do meio dos bares; fica na primeira
    // posição livre. O nome vai centrado no ponto escolhido.
    const spot = [
      { dx: 0, dy: -50 },
      { dx: 0, dy: 50 },
      { dx: -(w / 2 + 40), dy: 0 },
      { dx: w / 2 + 40, dy: 0 }
    ]
      .map(({ dx, dy }) => ({ x: p.x + dx, y: p.y + dy }))
      .find((c) => {
        const box = {
          x1: c.x - w / 2,
          y1: c.y - 12,
          x2: c.x + w / 2,
          y2: c.y + 12
        }
        return (
          box.y1 > covered &&
          box.x1 > 0 &&
          box.x2 < size.width &&
          !taken.some((t) => touches(t, box))
        )
      })
    if (!spot) continue
    taken.push({
      x1: spot.x - w / 2,
      y1: spot.y - 10,
      x2: spot.x + w / 2,
      y2: spot.y + 10
    })
    out.push({
      name: h.name,
      lat: topLat - (spot.y / size.height) * region.latitudeDelta,
      lng: left + (spot.x / size.width) * region.longitudeDelta
    })
  }
  return out
}
