import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { AppShell } from '@/components/app/app-shell'
import { MinuteTickProvider } from '@/components/app/minute-tick'
import { DashboardHero } from '@/components/dashboard/dashboard-hero'
import {
  DashboardResults,
  type SuggestionKind
} from '@/components/dashboard/dashboard-results'
import {
  type ActiveFilter,
  SearchFilterBar
} from '@/components/dashboard/search-filter-bar'
import {
  deriveDiscoveryResultState,
  type FavoriteOverrides,
  filterDiscoveryBars,
  resolveFavoriteIds,
  type SportsState,
  sortDiscoveryBars,
  toMapBars
} from '@/domain/dashboard-selectors'
import {
  DEFAULT_RADIUS_KM,
  type LocationState,
  type RadiusKm,
  SAO_PAULO_FALLBACK
} from '@/domain/discovery'
import { analytics } from '@/lib/analytics'
import { CATALOG_QUERY } from '@/lib/query-cache'
import { useTRPC } from '@/utils/trpc'

export const Route = createFileRoute('/(dashboard)/dashboard')({
  head: () => ({
    meta: [
      { title: 'Bares perto de você — Onside' },
      {
        name: 'description',
        content:
          'Descubra quais bares perto de você estão passando o jogo. Filtre por esporte, campeonato e distância.'
      },
      { name: 'robots', content: 'noindex' }
    ]
  }),
  component: FanDashboard
})

function FanDashboard() {
  const navigate = useNavigate()
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    null
  )
  const [locationState, setLocationState] = useState<LocationState>('unknown')
  const [sportId, setSportId] = useState<string>()
  const [championship, setChampionship] = useState('')
  const [radiusKm, setRadiusKm] = useState<RadiusKm>(DEFAULT_RADIUS_KM)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const [gamesTodayOnly, setGamesTodayOnly] = useState(false)
  const [favoriteOverrides, setFavoriteOverrides] = useState<FavoriteOverrides>(
    {}
  )
  const requestLocation = useCallback(() => {
    setLocationState('requesting')
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({
          lat: position.coords.latitude,
          lng: position.coords.longitude
        })
        setLocationState('granted')
      },
      (error) => {
        console.log('Geolocation error:', error.code, error.message)
        setLocationState(error.code === 1 ? 'denied' : 'unavailable')
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 5 * 60 * 1000 }
    )
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      setLocationState('unavailable')
      return
    }
    if (!navigator.permissions) {
      requestLocation()
      return
    }
    navigator.permissions
      .query({ name: 'geolocation' })
      .then((status) => {
        if (status.state === 'granted') requestLocation()
        else if (status.state === 'denied') setLocationState('denied')
        else setLocationState('idle')
      })
      .catch(requestLocation)
  }, [requestLocation])

  const sportsQuery = useQuery({
    ...trpc.pubs.getSports.queryOptions(),
    ...CATALOG_QUERY
  })
  const searchCenter = coords ?? SAO_PAULO_FALLBACK
  const primaryQuery = useQuery(
    trpc.pubs.search.queryOptions({
      ...searchCenter,
      radiusKm,
      sportId,
      championship: championship || undefined,
      limit: 30
    })
  )
  const primaryEmpty = primaryQuery.data?.bars.length === 0
  const fallbackQuery = useQuery({
    ...trpc.pubs.searchByLocation.queryOptions({
      ...searchCenter,
      radiusKm,
      limit: 30
    }),
    enabled: primaryEmpty
  })
  const favoritesQuery = useQuery(trpc.pubs.getFavorites.queryOptions())

  const resultState = useMemo(
    () =>
      deriveDiscoveryResultState({
        primary: primaryQuery,
        fallback: fallbackQuery,
        locationState,
        radiusKm
      }),
    [primaryQuery, fallbackQuery, locationState, radiusKm]
  )
  const sportsState: SportsState = sportsQuery.isLoading
    ? { status: 'loading' }
    : sportsQuery.isError || !sportsQuery.data
      ? { status: 'error', retry: () => void sportsQuery.refetch() }
      : { status: 'ready', sports: sportsQuery.data }
  const sports = sportsState.status === 'ready' ? sportsState.sports : []
  const favoriteIds = useMemo(
    () => resolveFavoriteIds(favoritesQuery.data ?? [], favoriteOverrides),
    [favoritesQuery.data, favoriteOverrides]
  )
  const sortedBars = useMemo(
    () =>
      resultState.status === 'ready' ? sortDiscoveryBars(resultState.bars) : [],
    [resultState]
  )
  const displayedBars = useMemo(
    () =>
      filterDiscoveryBars({
        bars: sortedBars,
        favoriteIds,
        favoritesOnly,
        gamesTodayOnly
      }),
    [sortedBars, favoriteIds, favoritesOnly, gamesTodayOnly]
  )
  const mapBars = toMapBars(displayedBars)

  const favoritesQueryKey = trpc.pubs.getFavorites.queryKey()
  const clearOverride = (barId: string, expected: boolean) => {
    setFavoriteOverrides((current) => {
      if (current[barId] !== expected) return current
      const remaining = { ...current }
      delete remaining[barId]
      return remaining
    })
  }
  const favoriteMutation = useMutation({
    mutationFn: trpc.pubs.favorite.mutationOptions().mutationFn,
    onMutate: ({ barId }) => {
      const previous = favoriteOverrides[barId]
      setFavoriteOverrides((current) => ({ ...current, [barId]: true }))
      return { previous }
    },
    onError: (_error, { barId }, context) => {
      setFavoriteOverrides((current) => ({
        ...current,
        [barId]: context?.previous
      }))
    },
    onSettled: async (_data, _error, { barId }) => {
      await queryClient.invalidateQueries({ queryKey: favoritesQueryKey })
      clearOverride(barId, true)
    }
  })
  const unfavoriteMutation = useMutation({
    mutationFn: trpc.pubs.unfavorite.mutationOptions().mutationFn,
    onMutate: ({ barId }) => {
      const previous = favoriteOverrides[barId]
      setFavoriteOverrides((current) => ({ ...current, [barId]: false }))
      return { previous }
    },
    onError: (_error, { barId }, context) => {
      setFavoriteOverrides((current) => ({
        ...current,
        [barId]: context?.previous
      }))
    },
    onSettled: async (_data, _error, { barId }) => {
      await queryClient.invalidateQueries({ queryKey: favoritesQueryKey })
      clearOverride(barId, false)
    }
  })

  const handleSportChange = (id: string | undefined) => {
    setSportId(id)
  }
  const handleRadiusChange = (value: RadiusKm) => {
    setRadiusKm(value)
  }
  const reset = () => {
    setSportId(undefined)
    setChampionship('')
    setRadiusKm(DEFAULT_RADIUS_KM)
    setFavoritesOnly(false)
    setGamesTodayOnly(false)
  }
  const applySuggestion = (kind: SuggestionKind) => {
    if (kind === 'brasileirao') {
      setGamesTodayOnly(true)
      setFavoritesOnly(false)
      setChampionship('Brasileirão')
      const football = sports.find((item) => item.slug === 'futebol')
      if (football) handleSportChange(football.id)
    } else if (kind === 'nba') {
      setGamesTodayOnly(false)
      setFavoritesOnly(false)
      setChampionship('NBA')
      const basketball = sports.find((item) => item.slug === 'basquete')
      if (basketball) handleSportChange(basketball.id)
    } else {
      reset()
    }
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: analytics fires for a resolved result snapshot, not intermediate filter input
  useEffect(() => {
    if (!primaryQuery.data) return
    analytics.searchPerformed({
      sport: sports.find((item) => item.id === sportId)?.slug,
      championship: championship || undefined,
      radius_km: radiusKm,
      results_count: primaryQuery.data.bars.length,
      has_location: locationState === 'granted'
    })
  }, [primaryQuery.data])

  const activeFilters: ActiveFilter[] = []
  const selectedSport = sports.find((item) => item.id === sportId)
  if (selectedSport) {
    activeFilters.push({
      label: selectedSport.name,
      clear: () => setSportId(undefined)
    })
  }
  if (championship) {
    activeFilters.push({
      label: championship,
      clear: () => setChampionship('')
    })
  }
  if (radiusKm !== DEFAULT_RADIUS_KM) {
    activeFilters.push({
      label: `Até ${radiusKm} km`,
      clear: () => setRadiusKm(DEFAULT_RADIUS_KM)
    })
  }
  if (favoritesOnly) {
    activeFilters.push({
      label: 'Meus favoritos',
      clear: () => setFavoritesOnly(false)
    })
  }
  if (gamesTodayOnly) {
    activeFilters.push({
      label: 'Jogos hoje',
      clear: () => setGamesTodayOnly(false)
    })
  }

  const retryResults = () => {
    if (resultState.status !== 'error') return
    if (resultState.source === 'primary') void primaryQuery.refetch()
    else void fallbackQuery.refetch()
  }
  const toggleFavorite = (barId: string) => {
    if (favoriteIds.has(barId)) {
      unfavoriteMutation.mutate({ barId })
    } else {
      analytics.barIntent({ bar_id: barId, action: 'favorite' })
      favoriteMutation.mutate({ barId })
    }
  }
  return (
    <AppShell variant="fan">
      <DashboardHero
        isLoading={resultState.status === 'loading'}
        count={displayedBars.length}
        locationState={locationState}
      />
      <SearchFilterBar
        championship={championship}
        onChampionshipChange={setChampionship}
        sportId={sportId}
        onSportChange={handleSportChange}
        radiusKm={radiusKm}
        onRadiusChange={handleRadiusChange}
        sportsState={sportsState}
        activeFilters={activeFilters}
        onReset={reset}
        locationState={locationState}
        onRequestLocation={requestLocation}
      />

      {locationState === 'denied' ? (
        <div className="onside-callout onside-callout-stone mb-4 w-full flex-col gap-1 text-xs">
          <p className="font-bold text-[var(--onside-ink)]">
            Localização bloqueada
          </p>
          <p className="text-[var(--onside-muted)]">
            <span className="font-semibold text-[var(--onside-ink)]">
              iPhone/iPad:
            </span>{' '}
            Ajustes → Privacidade → Serviços de Localização → Safari → Permitir
          </p>
          <p className="text-[var(--onside-muted)]">
            <span className="font-semibold text-[var(--onside-ink)]">
              Mac (Safari):
            </span>{' '}
            Safari → Ajustes → Sites → Localização → permitir este site
          </p>
        </div>
      ) : null}

      <MinuteTickProvider>
        <DashboardResults
          resultState={resultState}
          bars={displayedBars}
          mapBars={mapBars}
          radiusKm={radiusKm}
          hasActiveFilters={activeFilters.length > 0}
          locationState={locationState}
          coords={coords}
          hoveredId={hoveredId}
          favoriteIds={favoriteIds}
          favoritePending={
            favoriteMutation.isPending || unfavoriteMutation.isPending
          }
          onHover={setHoveredId}
          onFavorite={toggleFavorite}
          onRequestLocation={requestLocation}
          onRadiusChange={handleRadiusChange}
          onReset={reset}
          onRetry={retryResults}
          onSuggestion={applySuggestion}
          onSelectMapBar={(barId) => {
            const bar = displayedBars.find((item) => item.id === barId)
            analytics.barOpened({
              bar_id: barId,
              source: 'map',
              bar_plan: bar && 'plan' in bar ? bar.plan : undefined
            })
            navigate({ to: '/pub/$pubId', params: { pubId: barId } })
          }}
        />
      </MinuteTickProvider>
    </AppShell>
  )
}
