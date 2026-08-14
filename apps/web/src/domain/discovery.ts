export const SEARCH_RADII = [1, 3, 5, 10] as const
export type RadiusKm = (typeof SEARCH_RADII)[number]

export const DEFAULT_RADIUS_KM: RadiusKm = 5
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

export function getRadiusZoom(radiusKm: RadiusKm): number {
  if (radiusKm <= 1) return 15
  if (radiusKm <= 3) return 14
  if (radiusKm <= 5) return 13
  return 12
}
