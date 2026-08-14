import type { AppRouter } from '@findsports_oficial/api/routers/index'
import type { inferRouterOutputs } from '@trpc/server'
import type { MapBar } from '@/components/app/google-map'
import type { LocationState, RadiusKm } from './discovery'
import { getEventTemporalState } from './events'

type RouterOutputs = inferRouterOutputs<AppRouter>

export type SearchResult = RouterOutputs['pubs']['search']
export type SearchBar = SearchResult['bars'][number]
export type LocationSearchResult = RouterOutputs['pubs']['searchByLocation']
export type LocationBar = LocationSearchResult['bars'][number]
export type DiscoveryBar = SearchBar | LocationBar
export type DiscoveryCardBar = Pick<
  SearchBar,
  | 'id'
  | 'name'
  | 'neighborhood'
  | 'city'
  | 'latitude'
  | 'longitude'
  | 'photo_url'
  | 'distance_km'
> &
  Partial<Pick<SearchBar, 'created_at' | 'plan' | 'event_count' | 'nextEvent'>>
export type Favorite = RouterOutputs['pubs']['getFavorites'][number]
export type Sport = RouterOutputs['pubs']['getSports'][number]

export type SportsState =
  | { status: 'loading' }
  | { status: 'error'; retry: () => void }
  | { status: 'ready'; sports: Sport[] }

export type QuerySnapshot<T> = {
  data: T | undefined
  isLoading: boolean
  isError: boolean
}

export type DiscoveryResultState =
  | { status: 'loading' }
  | { status: 'error'; source: 'primary' | 'fallback' }
  | { status: 'location-required' }
  | { status: 'empty'; radiusKm: RadiusKm }
  | { status: 'ready'; bars: DiscoveryBar[]; fallback: boolean }

export type FavoriteOverrides = Readonly<Record<string, boolean | undefined>>

function needsLocation(locationState: LocationState): boolean {
  return (
    locationState === 'idle' ||
    locationState === 'unknown' ||
    locationState === 'requesting'
  )
}

export function deriveDiscoveryResultState({
  primary,
  fallback,
  locationState,
  radiusKm
}: {
  primary: QuerySnapshot<SearchResult>
  fallback: QuerySnapshot<LocationSearchResult>
  locationState: LocationState
  radiusKm: RadiusKm
}): DiscoveryResultState {
  if (primary.isLoading) return { status: 'loading' }
  if (primary.isError) return { status: 'error', source: 'primary' }

  if (primary.data && primary.data.bars.length > 0) {
    return { status: 'ready', bars: primary.data.bars, fallback: false }
  }

  if (!primary.data) return { status: 'loading' }
  if (fallback.isError) return { status: 'error', source: 'fallback' }
  if (fallback.isLoading || !fallback.data) return { status: 'loading' }

  if (fallback.data.bars.length > 0) {
    return { status: 'ready', bars: fallback.data.bars, fallback: true }
  }

  return needsLocation(locationState)
    ? { status: 'location-required' }
    : { status: 'empty', radiusKm }
}

function getNextEvent(bar: DiscoveryBar): SearchBar['nextEvent'] | undefined {
  return 'nextEvent' in bar ? bar.nextEvent : undefined
}

export function sortDiscoveryBars(bars: DiscoveryBar[]): DiscoveryBar[] {
  return [...bars].sort((first, second) => {
    const firstEvent = getNextEvent(first)
    const secondEvent = getNextEvent(second)
    if (firstEvent && !secondEvent) return -1
    if (!firstEvent && secondEvent) return 1
    if (!firstEvent || !secondEvent) return 0
    return (
      new Date(firstEvent.startsAt).getTime() -
      new Date(secondEvent.startsAt).getTime()
    )
  })
}

export function filterDiscoveryBars({
  bars,
  favoriteIds,
  favoritesOnly,
  gamesTodayOnly,
  now = new Date()
}: {
  bars: DiscoveryBar[]
  favoriteIds: ReadonlySet<string>
  favoritesOnly: boolean
  gamesTodayOnly: boolean
  now?: Date
}): DiscoveryBar[] {
  return bars.filter((bar) => {
    if (favoritesOnly && !favoriteIds.has(bar.id)) return false
    if (!gamesTodayOnly) return true
    const nextEvent = getNextEvent(bar)
    return nextEvent
      ? new Date(nextEvent.startsAt).toDateString() === now.toDateString()
      : false
  })
}

export function resolveFavoriteIds(
  favorites: Pick<Favorite, 'barId'>[],
  overrides: FavoriteOverrides
): Set<string> {
  const ids = new Set(favorites.map((favorite) => favorite.barId))
  for (const [barId, selected] of Object.entries(overrides)) {
    if (selected) ids.add(barId)
    else ids.delete(barId)
  }
  return ids
}

export function toMapBars(bars: DiscoveryBar[]): MapBar[] {
  return bars.flatMap((bar) => {
    const lat = Number.parseFloat(bar.latitude)
    const lng = Number.parseFloat(bar.longitude)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return []
    const nextEvent = getNextEvent(bar)
    const plan = 'plan' in bar ? bar.plan : 'starter'

    return [
      {
        id: bar.id,
        name: bar.name,
        lat,
        lng,
        accent:
          nextEvent && getEventTemporalState(nextEvent.startsAt) === 'live'
            ? 'live'
            : plan === 'pro' || plan === 'elite'
              ? 'acid'
              : 'ink'
      }
    ]
  })
}
