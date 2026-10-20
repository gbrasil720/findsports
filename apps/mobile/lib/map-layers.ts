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
 * Longe: grupos e pontos, sem rótulo. Médio: até 3 rótulos. Perto: rótulos
 * em todos que couberem.
 */
export function labelBudget(r: Region) {
  const km = kmAcross(r)
  if (km > 8) return 0
  if (km > 2.5) return 3
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
  covered = 0
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
    Math.round(zoomOf(region, size.width))
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

  // Rótulo por prioridade enquanto houver vaga e não encostar; o resto é
  // ponto. Com um bar tocado, nenhum outro ganha rótulo.
  let budget = selected ? 0 : labelBudget(region)
  for (const bar of singles.sort(byPriority)) {
    const p = at(bar.lat, bar.lng)
    const box = labelBox(p.x, p.y, bar.label)
    if (budget > 0 && box.y1 > covered && !taken.some((t) => touches(t, box))) {
      taken.push(box)
      budget -= 1
      layers.push({ kind: 'label', id: bar.id, bar })
    } else layers.push({ kind: 'point', id: bar.id, bar })
  }
  if (selected)
    layers.push({ kind: 'selected', id: selected.id, bar: selected })
  return layers
}

/** A região que abre o grupo: o zoom em que ele se separa, centrado nele. */
export function expandGroup(
  index: BarIndex,
  group: { clusterId: number; lat: number; lng: number },
  region: Region,
  width: number
): Region {
  const zoom = Math.min(index.getClusterExpansionZoom(group.clusterId), 19)
  const scale = 2 ** (zoom - zoomOf(region, width))
  return {
    latitude: group.lat,
    longitude: group.lng,
    latitudeDelta: region.latitudeDelta / scale,
    longitudeDelta: region.longitudeDelta / scale
  }
}
