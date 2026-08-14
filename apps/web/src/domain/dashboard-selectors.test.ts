import { describe, expect, test } from 'bun:test'
import {
  deriveDiscoveryResultState,
  filterDiscoveryBars,
  type LocationSearchResult,
  type QuerySnapshot,
  resolveFavoriteIds,
  type SearchBar,
  sortDiscoveryBars,
  toMapBars
} from './dashboard-selectors'
import type { RadiusKm } from './discovery'

const RADIUS: RadiusKm = 5

function makeBar(id: string, startsAt?: string): SearchBar {
  return {
    id,
    name: `Bar ${id}`,
    neighborhood: 'Centro',
    city: 'São Paulo',
    latitude: '-23.5',
    longitude: '-46.6',
    photo_url: null,
    created_at: '2026-08-01T00:00:00.000Z',
    distance_km: 1,
    plan: 'starter',
    event_count: startsAt ? 1 : 0,
    nextEvent: startsAt
      ? {
          id: `event-${id}`,
          championship: 'Liga',
          startsAt,
          sport: { name: 'Futebol', slug: 'futebol' },
          participants: [],
          participantFreeText: null
        }
      : undefined
  }
}

const emptyFallback: QuerySnapshot<LocationSearchResult> = {
  data: { bars: [], nextCursor: null },
  isLoading: false,
  isError: false
}

describe('deriveDiscoveryResultState', () => {
  test('keeps primary and fallback loading states explicit', () => {
    expect(
      deriveDiscoveryResultState({
        primary: { data: undefined, isLoading: true, isError: false },
        fallback: emptyFallback,
        locationState: 'granted',
        radiusKm: RADIUS
      })
    ).toEqual({ status: 'loading' })

    expect(
      deriveDiscoveryResultState({
        primary: {
          data: { bars: [], nextCursor: null },
          isLoading: false,
          isError: false
        },
        fallback: { data: undefined, isLoading: true, isError: false },
        locationState: 'granted',
        radiusKm: RADIUS
      })
    ).toEqual({ status: 'loading' })
  })

  test('keeps primary and fallback failures distinct from empty', () => {
    expect(
      deriveDiscoveryResultState({
        primary: { data: undefined, isLoading: false, isError: true },
        fallback: emptyFallback,
        locationState: 'granted',
        radiusKm: RADIUS
      })
    ).toEqual({ status: 'error', source: 'primary' })

    expect(
      deriveDiscoveryResultState({
        primary: {
          data: { bars: [], nextCursor: null },
          isLoading: false,
          isError: false
        },
        fallback: { data: undefined, isLoading: false, isError: true },
        locationState: 'granted',
        radiusKm: RADIUS
      })
    ).toEqual({ status: 'error', source: 'fallback' })
  })

  test('selects primary results before fallback results', () => {
    const bar = makeBar('one')
    expect(
      deriveDiscoveryResultState({
        primary: {
          data: { bars: [bar], nextCursor: null },
          isLoading: false,
          isError: false
        },
        fallback: emptyFallback,
        locationState: 'granted',
        radiusKm: RADIUS
      })
    ).toEqual({ status: 'ready', bars: [bar], fallback: false })
  })

  test('returns ready fallback results when the primary search is empty', () => {
    const fallbackBar = {
      id: 'fallback',
      name: 'Bar fallback',
      neighborhood: 'Centro',
      city: 'São Paulo',
      latitude: '-23.5',
      longitude: '-46.6',
      photo_url: null,
      created_at: '2026-08-01T00:00:00.000Z',
      distance_km: 1
    }
    expect(
      deriveDiscoveryResultState({
        primary: {
          data: { bars: [], nextCursor: null },
          isLoading: false,
          isError: false
        },
        fallback: {
          data: { bars: [fallbackBar], nextCursor: null },
          isLoading: false,
          isError: false
        },
        locationState: 'granted',
        radiusKm: RADIUS
      })
    ).toEqual({ status: 'ready', bars: [fallbackBar], fallback: true })
  })

  test('uses location-required only after both searches resolve empty', () => {
    expect(
      deriveDiscoveryResultState({
        primary: {
          data: { bars: [], nextCursor: null },
          isLoading: false,
          isError: false
        },
        fallback: emptyFallback,
        locationState: 'idle',
        radiusKm: RADIUS
      })
    ).toEqual({ status: 'location-required' })
  })

  test('returns an actual empty state after granted searches resolve empty', () => {
    expect(
      deriveDiscoveryResultState({
        primary: {
          data: { bars: [], nextCursor: null },
          isLoading: false,
          isError: false
        },
        fallback: emptyFallback,
        locationState: 'granted',
        radiusKm: RADIUS
      })
    ).toEqual({ status: 'empty', radiusKm: RADIUS })
  })
})

describe('dashboard display selectors', () => {
  test('sorts events first without non-null assertions', () => {
    const later = makeBar('later', '2026-08-13T20:00:00.000Z')
    const none = makeBar('none')
    const earlier = makeBar('earlier', '2026-08-13T18:00:00.000Z')
    expect(
      sortDiscoveryBars([later, none, earlier]).map((bar) => bar.id)
    ).toEqual(['earlier', 'later', 'none'])
  })

  test('preserves favorites-only and games-today filters', () => {
    const today = makeBar('today', '2026-08-13T18:00:00.000Z')
    const tomorrow = makeBar('tomorrow', '2026-08-14T18:00:00.000Z')
    expect(
      filterDiscoveryBars({
        bars: [today, tomorrow],
        favoriteIds: new Set(['today']),
        favoritesOnly: true,
        gamesTodayOnly: true,
        now: new Date('2026-08-13T10:00:00.000Z')
      }).map((bar) => bar.id)
    ).toEqual(['today'])
  })

  test('applies optimistic add and remove without changing rich cache records', () => {
    const favorites = [{ barId: 'kept' }, { barId: 'removed' }]
    const resolved = resolveFavoriteIds(favorites, {
      added: true,
      removed: false
    })
    expect([...resolved].sort()).toEqual(['added', 'kept'])
    expect(favorites).toEqual([{ barId: 'kept' }, { barId: 'removed' }])
  })

  test('lets the newest optimistic decision win for the same favorite id', () => {
    const favorites = [{ barId: 'existing' }]
    expect([...resolveFavoriteIds(favorites, { existing: false })]).toEqual([])
    expect([
      ...resolveFavoriteIds(favorites, {
        existing: true,
        added: true
      })
    ]).toEqual(['existing', 'added'])
  })

  test('adapts valid coordinates and semantic live accents for the map', () => {
    const live = makeBar('live', new Date(Date.now() - 60_000).toISOString())
    const invalid = { ...makeBar('invalid'), latitude: 'not-a-coordinate' }
    expect(
      toMapBars([live, invalid]).map((bar) => ({
        id: bar.id,
        accent: bar.accent,
        lat: bar.lat,
        lng: bar.lng
      }))
    ).toEqual([{ id: 'live', accent: 'live', lat: -23.5, lng: -46.6 }])
  })
})
