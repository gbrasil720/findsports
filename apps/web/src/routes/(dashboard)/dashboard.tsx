/** biome-ignore-all lint/a11y/useValidAriaRole: <> */
/** biome-ignore-all lint/correctness/useExhaustiveDependencies: <explanation> */

import { LoaderPinwheelIcon, NavigationIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { AppShell } from '@/components/app/app-shell'
import { GoogleMap, type MapBar } from '@/components/app/google-map'
import { BarCard } from '@/components/dashboard/bar-card'
import { BarResultsHeader } from '@/components/dashboard/bar-results-header'
import { DashboardHero } from '@/components/dashboard/dashboard-hero'
import { SearchFilterBar } from '@/components/dashboard/search-filter-bar'
import { analytics } from '@/lib/analytics'
import { useTRPC } from '@/utils/trpc'

export const Route = createFileRoute('/(dashboard)/dashboard')({
  head: () => ({
    meta: [
      { title: 'Bares perto de você — FindSports' },
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

const LIVE_WINDOW_MS = 3 * 60 * 60 * 1000

function isLive(startsAt: string | Date): boolean {
  const start = new Date(startsAt).getTime()
  const now = Date.now()
  return now >= start && now <= start + LIVE_WINDOW_MS
}

type ApiBar = {
  id: string
  name: string
  neighborhood: string
  city: string
  latitude: string
  longitude: string
  distance_km: number
  photo_url?: string | null
  created_at?: string
  event_count?: number
}

type ApiEvent = {
  id: string
  championship: string
  startsAt: string
  sport: { name: string; slug: string }
  participants: { team: { name: string; logoUrl?: string | null } }[]
}

type BarWithEvents = ApiBar & {
  nextEvent?: ApiEvent
  plan: 'starter' | 'pro' | 'elite'
}

function FanDashboard() {
  const navigate = useNavigate()
  const trpc = useTRPC()

  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    null
  )
  const [locationState, setLocationState] = useState<
    'unknown' | 'idle' | 'requesting' | 'granted' | 'denied' | 'unavailable'
  >('unknown')
  const locationError =
    locationState === 'denied' || locationState === 'unavailable'
  const [sportId, setSportId] = useState<string | undefined>(undefined)
  const [championship, setChampionship] = useState('')
  const [radiusKm, setRadiusKm] = useState<1 | 3 | 5 | 10>(5)
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  const [, setTick] = useState(0)
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 60_000)
    return () => clearInterval(interval)
  }, [])

  // dashboard_viewed uma vez ao montar
  useEffect(() => {
    analytics.dashboardViewed()
  }, [])

  const requestLocation = useCallback(() => {
    setLocationState('requesting')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setLocationState('granted')
      },
      (err) => {
        console.log('Geolocation error:', err.code, err.message)
        setLocationState(err.code === 1 ? 'denied' : 'unavailable')
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 5 * 60 * 1000 }
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
        if (status.state === 'granted') {
          requestLocation()
        } else if (status.state === 'denied') {
          setLocationState('denied')
        } else {
          setLocationState('idle')
        }
      })
      .catch(() => {
        requestLocation()
      })
  }, [requestLocation])

  const { data: sports = [] } = useQuery(trpc.pubs.getSports.queryOptions())

  const { data: barsData, isLoading } = useQuery({
    ...trpc.pubs.search.queryOptions({
      lat: coords?.lat ?? -23.5505,
      lng: coords?.lng ?? -46.6333,
      radiusKm,
      sportId,
      championship: championship || undefined,
      limit: 30
    }),
    enabled: true
  })

  const noEventBars = barsData !== undefined && barsData.bars.length === 0

  const { data: locationBarsData, isLoading: isLocationLoading } = useQuery({
    ...trpc.pubs.searchByLocation.queryOptions({
      lat: coords?.lat ?? -23.5505,
      lng: coords?.lng ?? -46.6333,
      radiusKm,
      limit: 30
    }),
    enabled: noEventBars
  })

  const queryClient = useQueryClient()

  const { data: favoritesData = [] } = useQuery(
    trpc.pubs.getFavorites.queryOptions()
  )
  const favoriteIds = useMemo(
    () => new Set(favoritesData.map((f) => f.barId)),
    [favoritesData]
  )

  const favoritesQueryKey = trpc.pubs.getFavorites.queryKey()
  type FavoritesCache = typeof favoritesData

  const optimisticAdd = async ({ barId }: { barId: string }) => {
    await queryClient.cancelQueries({ queryKey: favoritesQueryKey })
    const prev = queryClient.getQueryData<FavoritesCache>(favoritesQueryKey)
    queryClient.setQueryData<FavoritesCache>(favoritesQueryKey, (old = []) => [
      ...old,
      { barId, userId: '' } as FavoritesCache[number]
    ])
    return { prev }
  }

  const optimisticRemove = async ({ barId }: { barId: string }) => {
    await queryClient.cancelQueries({ queryKey: favoritesQueryKey })
    const prev = queryClient.getQueryData<FavoritesCache>(favoritesQueryKey)
    queryClient.setQueryData<FavoritesCache>(favoritesQueryKey, (old = []) =>
      old.filter((f) => f.barId !== barId)
    )
    return { prev }
  }

  const refetch = () =>
    queryClient.invalidateQueries({ queryKey: favoritesQueryKey })

  const favoriteMutation = useMutation({
    mutationFn: trpc.pubs.favorite.mutationOptions().mutationFn,
    onMutate: optimisticAdd,
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev !== undefined)
        queryClient.setQueryData<FavoritesCache>(favoritesQueryKey, ctx.prev)
    },
    onSettled: refetch
  })
  const unfavoriteMutation = useMutation({
    mutationFn: trpc.pubs.unfavorite.mutationOptions().mutationFn,
    onMutate: optimisticRemove,
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev !== undefined)
        queryClient.setQueryData<FavoritesCache>(favoritesQueryKey, ctx.prev)
    },
    onSettled: refetch
  })

  const bars = useMemo((): BarWithEvents[] => {
    if ((barsData?.bars?.length ?? 0) > 0)
      return (barsData?.bars ?? []) as BarWithEvents[]
    return (locationBarsData?.bars ?? []) as BarWithEvents[]
  }, [barsData, locationBarsData])

  const isFallbackMode =
    noEventBars && (locationBarsData?.bars?.length ?? 0) > 0
  const effectiveLoading = isLoading || (noEventBars && isLocationLoading)

  const sorted = useMemo(() => {
    return [...bars].sort((a, b) => {
      const aHas = !!a.nextEvent
      const bHas = !!b.nextEvent
      if (aHas && !bHas) return -1
      if (!aHas && bHas) return 1
      if (!aHas && !bHas) return 0
      return (
        new Date(a.nextEvent!.startsAt).getTime() -
        new Date(b.nextEvent!.startsAt).getTime()
      )
    })
  }, [bars])

  const mapBars: MapBar[] = sorted.map((b) => ({
    id: b.id,
    name: b.name,
    lat: parseFloat(b.latitude),
    lng: parseFloat(b.longitude),
    accent:
      b.nextEvent && isLive(b.nextEvent.startsAt)
        ? 'orange'
        : b.plan === 'pro' || b.plan === 'elite'
          ? 'blue'
          : 'black',
    occupancy: 0
  }))

  const activeFilters: { label: string; clear: () => void }[] = []
  if (sportId) {
    const sport = sports.find((s) => s.id === sportId)
    if (sport)
      activeFilters.push({
        label: sport.name,
        clear: () => setSportId(undefined)
      })
  }
  if (championship) {
    activeFilters.push({
      label: championship,
      clear: () => setChampionship('')
    })
  }
  if (radiusKm !== 5) {
    activeFilters.push({
      label: `Até ${radiusKm} km`,
      clear: () => setRadiusKm(5)
    })
  }

  const handleSportChange = (id: string | undefined) => {
    setSportId(id)
    if (id) {
      const sport = sports.find((s) => s.id === id)
      analytics.searchFilterApplied('sport', sport?.name ?? id)
    }
  }

  const handleChampionshipChange = (value: string) => {
    setChampionship(value)
  }

  const handleChampionshipSearch = () => {
    if (championship)
      analytics.searchFilterApplied('championship', championship)
  }

  const handleRadiusChange = (km: 1 | 3 | 5 | 10) => {
    setRadiusKm(km)
    analytics.searchFilterApplied('radius_km', km)
  }

  const reset = () => {
    setSportId(undefined)
    setChampionship('')
    setRadiusKm(5)
  }

  // Captura search_performed quando os dados de busca mudam e há resultado
  useEffect(() => {
    if (!barsData) return
    analytics.searchPerformed({
      sportId,
      radius_km: radiusKm,
      results_count: barsData.bars.length
    })
  }, [barsData])

  return (
    <AppShell role="fan">
      <DashboardHero
        isLoading={effectiveLoading}
        count={sorted.length}
        locationError={locationError}
      />

      <SearchFilterBar
        championship={championship}
        onChampionshipChange={handleChampionshipChange}
        sportId={sportId}
        onSportChange={handleSportChange}
        radiusKm={radiusKm}
        onRadiusChange={handleRadiusChange}
        sports={sports}
        activeFilters={activeFilters}
        onReset={reset}
      />

      {locationState === 'idle' && (
        <button
          type="button"
          onClick={requestLocation}
          className="w-full flex items-center gap-2 bg-brand-orange/10 text-brand-orange text-sm font-bold px-4 py-3 rounded-2xl mb-2 hover:bg-brand-orange/20"
        >
          <HugeiconsIcon
            icon={NavigationIcon}
            size={16}
            color="currentColor"
            strokeWidth={2}
            className="shrink-0"
          />
          Compartilhar localização para ver bares perto de você
        </button>
      )}

      {locationState === 'denied' && (
        <div className="w-full flex flex-col gap-1 bg-zinc-100 text-zinc-600 text-xs px-4 py-3 rounded-2xl mb-2">
          <p className="font-bold text-zinc-700">Localização bloqueada</p>
          <p>
            <span className="font-semibold">iPhone/iPad:</span> Ajustes →
            Privacidade → Serviços de Localização → Safari → Permitir
          </p>
          <p>
            <span className="font-semibold">Mac (Safari):</span> Safari →
            Ajustes → Sites → Localização → permitir este site
          </p>
        </div>
      )}

      <div className="grid lg:grid-cols-[1fr_1fr] gap-6">
        <section className="min-w-0 lg:order-last">
          <BarResultsHeader count={sorted.length} />

          {effectiveLoading && (
            <div className="flex items-center justify-center py-16 text-zinc-400">
              <HugeiconsIcon
                icon={LoaderPinwheelIcon}
                size={24}
                color="currentColor"
                strokeWidth={1.5}
                className="animate-spin mr-2"
              />
              <span className="text-sm">Buscando bares...</span>
            </div>
          )}

          {isFallbackMode && !effectiveLoading && sorted.length > 0 && (
            <p className="text-xs text-zinc-400 mb-3">
              Nenhum evento programado na região. Mostrando todos os bares
              próximos.
            </p>
          )}

          <div className="space-y-3">
            {!effectiveLoading && sorted.length === 0 && (
              <div className="bg-white rounded-2xl ring-1 ring-black/5 p-8 text-center">
                <p className="font-semibold text-zinc-600">
                  Nenhum bar encontrado nessa região com esses filtros.
                </p>
                <button
                  type="button"
                  onClick={reset}
                  className="text-sm font-bold text-brand-orange mt-2 hover:underline"
                >
                  Limpar filtros
                </button>
              </div>
            )}

            {sorted.map((bar) => (
              <BarCard
                key={bar.id}
                bar={bar}
                isHovered={hoveredId === bar.id}
                isFavorite={favoriteIds.has(bar.id)}
                onMouseEnter={() => setHoveredId(bar.id)}
                onMouseLeave={() => setHoveredId(null)}
                onFavorite={(id) => {
                  if (favoriteIds.has(id)) {
                    analytics.barUnfavorited(id)
                    unfavoriteMutation.mutate({ barId: id })
                  } else {
                    analytics.barFavorited(id)
                    favoriteMutation.mutate({ barId: id })
                  }
                }}
              />
            ))}
          </div>

          {barsData?.nextCursor != null && (
            <div className="mt-6 text-center">
              <button
                type="button"
                className="px-6 py-2.5 rounded-full bg-zinc-100 text-sm font-bold text-zinc-700 hover:bg-zinc-200"
              >
                Ver mais bares
              </button>
            </div>
          )}
        </section>

        <section className="relative rounded-3xl overflow-hidden ring-1 ring-black/5 h-[280px] sm:h-[360px] lg:h-[640px] lg:sticky lg:top-44 lg:order-first bg-zinc-100">
          <GoogleMap
            bars={mapBars}
            center={coords ?? undefined}
            hoveredId={hoveredId}
            onHover={setHoveredId}
            onSelect={(id) => {
              analytics.barMapPinClicked(id)
              navigate({ to: '/pub/$pubId', params: { pubId: id } })
            }}
          />
          <div className="pointer-events-none absolute top-4 left-4 bg-white/95 backdrop-blur rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest ring-1 ring-black/5">
            <HugeiconsIcon
              icon={NavigationIcon}
              size={12}
              color="currentColor"
              strokeWidth={1.5}
              className="inline mr-1.5 text-brand-orange"
            />
            {locationError ? 'São Paulo, SP' : 'Perto de você'}
          </div>
        </section>
      </div>
    </AppShell>
  )
}
