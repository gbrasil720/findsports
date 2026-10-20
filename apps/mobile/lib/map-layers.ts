/*
 * Mapa sem amontoado (Rodada 20 do design, 20a a 20d): o que cada bar vira
 * na tela. Grupo (bares a menos de ~60 px), ponto (o padrão) ou rótulo (só os
 * de maior prioridade que cabem sem encostar). O bar tocado é o selecionado.
 * Contas puras sobre a região visível; a tela fica em `app/(fan)/explore.tsx`.
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
      lat: number
      lng: number
      count: number
      live: number
      ids: string[]
    }
  | { kind: 'point' | 'label' | 'selected'; id: string; bar: MapBar }

/** Distância na tela abaixo da qual os bares viram um grupo. */
export const GROUP_PX = 60

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

type Box = { x1: number; y1: number; x2: number; y2: number }
const touches = (a: Box, b: Box) =>
  a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2

/** Caixa do rótulo: centrada acima do ponto, largura pelo texto. */
function labelBox(x: number, y: number, label: string): Box {
  const w = label.length * 7.2 + 30
  return { x1: x - w / 2, y1: y - 46, x2: x + w / 2, y2: y - 12 }
}

export function mapLayers(
  bars: MapBar[],
  region: Region,
  size: { width: number; height: number },
  selectedId: string | null
): Layer[] {
  const left = region.longitude - region.longitudeDelta / 2
  const topLat = region.latitude + region.latitudeDelta / 2
  const at = (b: { lat: number; lng: number }) => ({
    x: ((b.lng - left) / region.longitudeDelta) * size.width,
    y: ((topLat - b.lat) / region.latitudeDelta) * size.height
  })

  const sorted = [...bars].sort(byPriority)
  const selected = sorted.find((b) => b.id === selectedId) ?? null
  // O selecionado nunca entra em grupo: fica por cima de tudo.
  const rest = sorted.filter((b) => b !== selected)

  const groups: { x: number; y: number; members: MapBar[] }[] = []
  for (const bar of rest) {
    const p = at(bar)
    const near = groups.find((g) => Math.hypot(g.x - p.x, g.y - p.y) < GROUP_PX)
    if (near) near.members.push(bar)
    else groups.push({ ...p, members: [bar] })
  }

  const layers: Layer[] = []
  const taken: Box[] = []
  if (selected) {
    const p = at(selected)
    taken.push(labelBox(p.x, p.y, selected.label))
  }
  // Grupos ocupam a tela antes dos rótulos.
  for (const g of groups)
    if (g.members.length > 1)
      taken.push({ x1: g.x - 22, y1: g.y - 22, x2: g.x + 22, y2: g.y + 22 })

  let budget = selected ? 0 : labelBudget(region)
  // Com um bar tocado, os outros só aparecem como ponto (apagados).
  for (const g of groups) {
    const [first] = g.members
    if (!first) continue
    if (g.members.length > 1) {
      const lat = g.members.reduce((s, b) => s + b.lat, 0) / g.members.length
      const lng = g.members.reduce((s, b) => s + b.lng, 0) / g.members.length
      layers.push({
        kind: 'group',
        id: `group:${g.members
          .map((b) => b.id)
          .sort()
          .join(',')}`,
        lat,
        lng,
        count: g.members.length,
        live: g.members.filter((b) => b.live).length,
        ids: g.members.map((b) => b.id)
      })
      continue
    }
    const box = labelBox(g.x, g.y, first.label)
    if (budget > 0 && !taken.some((t) => touches(t, box))) {
      taken.push(box)
      budget -= 1
      layers.push({ kind: 'label', id: first.id, bar: first })
    } else layers.push({ kind: 'point', id: first.id, bar: first })
  }
  if (selected)
    layers.push({ kind: 'selected', id: selected.id, bar: selected })
  return layers
}

/** Região que aproxima o grupo até os bares se separarem. */
export function zoomInto(
  group: { lat: number; lng: number },
  region: Region
): Region {
  return {
    latitude: group.lat,
    longitude: group.lng,
    latitudeDelta: Math.max(region.latitudeDelta / 3, 0.002),
    longitudeDelta: Math.max(region.longitudeDelta / 3, 0.002)
  }
}
