export const SEARCH_RADII = [1, 3, 5, 10] as const
export type RadiusKm = (typeof SEARCH_RADII)[number]

/**
 * Só vale quando não há torcedor identificado — no público e enquanto a
 * sessão carrega. Com sessão, o raio é o que a pessoa salvou; ver
 * `normalizeRadiusKm`.
 */
export const DEFAULT_RADIUS_KM: RadiusKm = 5

/**
 * O raio salvo vem do banco como `integer` e nada garante que ele esteja na
 * escala oferecida na tela. Cai no degrau válido mais próximo em vez de
 * deixar um valor fora da escala marcar nenhum botão.
 */
export function normalizeRadiusKm(value: number | null | undefined): RadiusKm {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_RADIUS_KM
  }
  return SEARCH_RADII.reduce((closest, candidate) =>
    Math.abs(candidate - value) < Math.abs(closest - value)
      ? candidate
      : closest
  )
}
export const SAO_PAULO_FALLBACK = { lat: -23.5505, lng: -46.6333 } as const

export type LocationState =
  | 'unknown'
  | 'idle'
  | 'requesting'
  | 'granted'
  | 'denied'
  | 'unavailable'

export type Coordinates = { lat: number; lng: number }

export function isValidCoordinate(value: number, axis: 'lat' | 'lng'): boolean {
  if (!Number.isFinite(value)) return false
  return axis === 'lat'
    ? value >= -90 && value <= 90
    : value >= -180 && value <= 180
}

export function isValidCoordinates(coords: Coordinates): boolean {
  return (
    isValidCoordinate(coords.lat, 'lat') && isValidCoordinate(coords.lng, 'lng')
  )
}
