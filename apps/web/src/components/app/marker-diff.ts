import type { MapAccent } from './google-map-icons'

/**
 * Estado visual de um pino no mapa (ESC-16).
 *
 * O efeito que sincroniza os pinos roda a cada mudança de `hoveredId`. Sem
 * comparar, ele reaplicava posição, título, ícone e ordem em TODOS os pinos a
 * cada movimento do mouse — mesmo que só dois mudassem: o que entrou e o que
 * saiu do hover.
 *
 * Manter o último estado aplicado e comparar reduz o trabalho ao que de fato
 * mudou. A comparação é explícita, e não genérica, porque cada campo tem um
 * setter diferente na API do mapa.
 */
export type MarkerVisualState = {
  lat: number
  lng: number
  name: string
  accent: MapAccent
  large: boolean
}

export type MarkerUpdates = {
  position: boolean
  title: boolean
  icon: boolean
  zIndex: boolean
}

const NADA_A_FAZER: MarkerUpdates = {
  position: false,
  title: false,
  icon: false,
  zIndex: false
}

const TUDO: MarkerUpdates = {
  position: true,
  title: true,
  icon: true,
  zIndex: true
}

export function diffMarkerState(
  anterior: MarkerVisualState | undefined,
  atual: MarkerVisualState
): MarkerUpdates {
  // Pino novo: aplica tudo.
  if (!anterior) return TUDO

  const position = anterior.lat !== atual.lat || anterior.lng !== atual.lng
  const title = anterior.name !== atual.name
  // O ícone depende da cor e do tamanho; `large` também muda a ordem de
  // empilhamento, para o pino destacado ficar por cima.
  const icon =
    anterior.accent !== atual.accent || anterior.large !== atual.large
  const zIndex = anterior.large !== atual.large

  if (!position && !title && !icon && !zIndex) return NADA_A_FAZER
  return { position, title, icon, zIndex }
}

export function nenhumaMudanca(updates: MarkerUpdates): boolean {
  return !updates.position && !updates.title && !updates.icon && !updates.zIndex
}
