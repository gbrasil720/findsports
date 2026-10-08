import {
  findAmenity,
  MAX_AMENITY_FILTER
} from '@findsports_oficial/api/lib/amenities'
import { z } from 'zod'

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

/**
 * Os filtros do `/dashboard` que moram na URL (WEB-293): recarregar não perde
 * a busca e o link pode ser compartilhado.
 *
 * Vão no hash, e não em query string, pelo mesmo motivo das abas do `/admin`:
 * o `beforeLoad` da raiz só reaproveita a sessão quando a navegação muda
 * apenas o hash (`isHashOnlyChange`); em query string cada filtro custaria uma
 * ida ao servidor.
 */
export type DashboardFilters = {
  /** O termo já assentado da busca, não cada tecla. */
  championship: string
  /** Slug, e não id: é o que se lê num link e não muda de um banco para outro. */
  sportSlug: string | undefined
  radiusKm: RadiusKm
  amenities: number[]
  teamIds: string[]
  sort: 'relevance' | 'rating'
  favoritesOnly: boolean
  gamesTodayOnly: boolean
}

/**
 * Filtros → hash, sem o `#`. Filtro no valor padrão fica de fora: dashboard
 * sem filtro devolve `''` e a URL continua limpa. O padrão do raio é o do
 * perfil de quem está vendo.
 */
export function serializeDashboardFilters(
  filters: DashboardFilters,
  preferredRadiusKm: RadiusKm
): string {
  const params = new URLSearchParams()
  if (filters.championship) params.set('busca', filters.championship)
  if (filters.sportSlug) params.set('esporte', filters.sportSlug)
  if (filters.radiusKm !== preferredRadiusKm) {
    params.set('raio', String(filters.radiusKm))
  }
  for (const id of filters.amenities) params.append('comodidade', String(id))
  for (const id of filters.teamIds) params.append('time', id)
  if (filters.sort === 'rating') params.set('ordem', 'avaliacao')
  if (filters.favoritesOnly) params.set('favoritos', '1')
  if (filters.gamesTodayOnly) params.set('hoje', '1')
  return params.toString()
}

/**
 * Hash → filtros. O hash é texto que qualquer um edita: cada campo inválido
 * cai no próprio padrão sem derrubar os outros, e nada daqui chega ao
 * servidor fora do formato que `pubs.search` aceita.
 *
 * Esporte e time só têm o formato conferido — se existem, quem sabe é o
 * catálogo, que a tela consulta depois.
 */
export function parseDashboardFilters(
  hash: string,
  preferredRadiusKm: RadiusKm
): DashboardFilters {
  const params = new URLSearchParams(hash.replace(/^#/, ''))
  const radius = Number(params.get('raio'))
  return {
    championship: params.get('busca') ?? '',
    sportSlug: params.get('esporte') || undefined,
    radiusKm: SEARCH_RADII.find((km) => km === radius) ?? preferredRadiusKm,
    amenities: [
      ...new Set(
        params
          .getAll('comodidade')
          .map(Number)
          .filter((id) => findAmenity(id))
      )
    ].slice(0, MAX_AMENITY_FILTER),
    teamIds: [
      ...new Set(
        params.getAll('time').filter((id) => z.uuid().safeParse(id).success)
      )
    ],
    sort: params.get('ordem') === 'avaliacao' ? 'rating' : 'relevance',
    favoritesOnly: params.get('favoritos') === '1',
    gamesTodayOnly: params.get('hoje') === '1'
  }
}
