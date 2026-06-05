/** biome-ignore-all lint/a11y/useButtonType: <> */
/** biome-ignore-all lint/a11y/useValidAriaRole: <> */
import { useMutation, useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import {
  Flame,
  Heart,
  Loader2,
  MapPin,
  Navigation,
  Search,
  X
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { AppShell } from '@/components/app/app-shell'
import { GoogleMap, type MapBar } from '@/components/app/google-map'
import { useTRPC } from '@/utils/trpc'

export const Route = createFileRoute('/(dashboard)/dashboard')({
  head: () => ({
    meta: [
      { title: 'Encontre o bar perfeito — FindSports' },
      {
        name: 'description',
        content: 'Filtre bares por jogo, distância e time. Veja no mapa.'
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

function isUpcoming(startsAt: string | Date): boolean {
  return new Date(startsAt).getTime() > Date.now()
}

function formatStartsAt(startsAt: string | Date): string {
  return new Date(startsAt).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: undefined
  })
}

function formatDate(startsAt: string | Date): string {
  const d = new Date(startsAt)
  const today = new Date()
  const tomorrow = new Date()
  tomorrow.setDate(today.getDate() + 1)

  if (d.toDateString() === today.toDateString()) return 'Hoje'
  if (d.toDateString() === tomorrow.toDateString()) return 'Amanhã'
  return d.toLocaleDateString('pt-BR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short'
  })
}

const RADIUS_OPTIONS = [1, 3, 5, 10] as const
const SORTS = ['Distância', 'Horário'] as const
type SortKey = (typeof SORTS)[number]

type ApiBar = {
  id: string
  name: string
  neighborhood: string
  city: string
  latitude: string
  longitude: string
  distance_km: number
  photo_url?: string | null
}

type ApiEvent = {
  id: string
  championship: string
  startsAt: string
  sport: { name: string; slug: string }
  participants: { team: { name: string; logoUrl?: string | null } }[]
}

type BarWithEvents = ApiBar & { nextEvent?: ApiEvent }

function FanDashboard() {
  const navigate = useNavigate()
  const trpc = useTRPC()

  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    null
  )
  const [locationError, setLocationError] = useState(false)

  const [sportId, setSportId] = useState<string | undefined>(undefined)
  const [championship, setChampionship] = useState('')
  const [radiusKm, setRadiusKm] = useState<1 | 3 | 5 | 10>(5)
  const [sort, setSort] = useState<SortKey>('Distância')
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  const [, setTick] = useState(0)
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 60_000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (!navigator.geolocation) {
      setLocationError(true)
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setLocationError(true)
    )
  }, [])

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

  const favoriteMutation = useMutation(trpc.pubs.favorite.mutationOptions())
  const unfavoriteMutation = useMutation(trpc.pubs.unfavorite.mutationOptions())

  const bars = (barsData?.bars ?? []) as BarWithEvents[]

  const sorted = useMemo(() => {
    return [...bars].sort((a, b) => {
      if (sort === 'Distância') return a.distance_km - b.distance_km
      if (!a.nextEvent || !b.nextEvent) return 0
      return (
        new Date(a.nextEvent.startsAt).getTime() -
        new Date(b.nextEvent.startsAt).getTime()
      )
    })
  }, [bars, sort])

  const mapBars: MapBar[] = sorted.map((b) => ({
    id: b.id,
    name: b.name,
    lat: parseFloat(b.latitude),
    lng: parseFloat(b.longitude),
    accent: b.nextEvent && isLive(b.nextEvent.startsAt) ? 'orange' : 'black',
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

  const reset = () => {
    setSportId(undefined)
    setChampionship('')
    setRadiusKm(5)
  }

  return (
    <AppShell role="fan" userName="John Doe" userMeta="John Doe">
      <div className="mb-6">
        <div className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.25em] text-brand-orange mb-2">
          <span className="size-1.5 rounded-full bg-brand-orange animate-pulse" />
          {isLoading
            ? 'Buscando bares...'
            : `${sorted.length} ${sorted.length === 1 ? 'bar' : 'bares'} perto de você`}
        </div>
        <h1 className="font-heading text-3xl md:text-4xl font-bold tracking-tight">
          Onde você assiste hoje?
        </h1>
        {locationError && (
          <p className="text-xs text-zinc-500 mt-1">
            Localização não disponível — mostrando bares em São Paulo.
          </p>
        )}
      </div>

      <div className="sticky top-16 z-20 -mx-4 px-4 md:mx-0 md:px-0 mb-6">
        <div className="bg-white rounded-2xl ring-1 ring-black/5 shadow-sm p-3 md:p-4 space-y-3">
          <div className="flex flex-col md:flex-row gap-3 md:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-zinc-400" />
              <input
                value={championship}
                onChange={(e) => setChampionship(e.target.value)}
                placeholder="Buscar por campeonato..."
                className="w-full pl-11 pr-4 py-3 rounded-xl bg-zinc-50 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand-orange/30"
              />
              {championship && (
                <button
                  onClick={() => setChampionship('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-zinc-200"
                >
                  <X className="size-3.5 text-zinc-500" />
                </button>
              )}
            </div>

            <div className="relative">
              <select
                value={sportId ?? ''}
                onChange={(e) => setSportId(e.target.value || undefined)}
                className="appearance-none pl-3 pr-8 py-3 rounded-xl bg-zinc-50 text-xs font-bold text-zinc-700 hover:bg-zinc-100 focus:outline-none focus:ring-2 focus:ring-brand-orange/30 cursor-pointer"
              >
                <option value="">🏆 Todos os esportes</option>
                {sports.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-zinc-500 pointer-events-none">
                ▼
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 px-1">
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500 whitespace-nowrap">
              Raio
            </span>
            <div className="flex gap-2">
              {RADIUS_OPTIONS.map((km) => (
                <button
                  key={km}
                  type="button"
                  onClick={() => setRadiusKm(km)}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${
                    radiusKm === km
                      ? 'bg-brand-orange text-white'
                      : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                  }`}
                >
                  {km} km
                </button>
              ))}
            </div>
          </div>

          {activeFilters.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              {activeFilters.map((c) => (
                <button
                  key={c.label}
                  onClick={c.clear}
                  className="inline-flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-full bg-brand-orange/10 text-brand-orange hover:bg-brand-orange/15"
                >
                  {c.label} <X className="size-3" />
                </button>
              ))}
              <button
                onClick={reset}
                className="text-[11px] font-bold text-zinc-500 hover:text-black px-2"
              >
                Limpar tudo
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr_1fr] gap-6">
        <section className="relative rounded-3xl overflow-hidden ring-1 ring-black/5 h-[420px] lg:h-[640px] lg:sticky lg:top-44 bg-zinc-100">
          <GoogleMap
            bars={mapBars}
            center={coords ?? undefined}
            hoveredId={hoveredId}
            onHover={setHoveredId}
            onSelect={(id) =>
              navigate({ to: '/pub/$pubId', params: { pubId: id } })
            }
          />
          <div className="pointer-events-none absolute top-4 left-4 bg-white/95 backdrop-blur rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest ring-1 ring-black/5">
            <Navigation className="inline size-3 mr-1.5 text-brand-orange" />
            {locationError ? 'São Paulo, SP' : 'Perto de você'}
          </div>
        </section>

        <section className="min-w-0">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-heading text-xl font-bold flex items-center gap-2">
              <Flame className="size-5 text-brand-orange" />
              {sorted.length} resultado{sorted.length !== 1 ? 's' : ''}
            </h2>
            <div className="flex gap-1 text-xs font-bold">
              {SORTS.map((s) => (
                <button
                  key={s}
                  onClick={() => setSort(s)}
                  className={`px-3 py-1.5 rounded-full transition-colors ${
                    sort === s
                      ? 'bg-black text-white'
                      : 'text-zinc-600 hover:text-black'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {isLoading && (
            <div className="flex items-center justify-center py-16 text-zinc-400">
              <Loader2 className="size-6 animate-spin mr-2" />
              <span className="text-sm">Buscando bares...</span>
            </div>
          )}

          <div className="space-y-3">
            {!isLoading && sorted.length === 0 && (
              <div className="bg-white rounded-2xl ring-1 ring-black/5 p-8 text-center">
                <p className="font-semibold text-zinc-600">
                  Nenhum bar encontrado com esses filtros.
                </p>
                <button
                  onClick={reset}
                  className="text-sm font-bold text-brand-orange mt-2 hover:underline"
                >
                  Limpar filtros
                </button>
              </div>
            )}

            {sorted.map((bar) => {
              const event = bar.nextEvent
              const live = event ? isLive(event.startsAt) : false
              const upcoming = event ? isUpcoming(event.startsAt) : false
              const initials = bar.name
                .split(' ')
                .map((w: string) => w[0])
                .join('')
                .slice(0, 2)

              return (
                <Link
                  key={bar.id}
                  to="/pub/$pubId"
                  params={{ pubId: bar.id }}
                  onMouseEnter={() => setHoveredId(bar.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  className={`group bg-white rounded-2xl ring-1 transition-all p-4 grid grid-cols-[auto_1fr_auto] gap-4 items-center ${
                    hoveredId === bar.id
                      ? 'ring-brand-orange/50 shadow-lg'
                      : 'ring-black/5 hover:ring-brand-orange/30'
                  }`}
                >
                  <div
                    className={`size-16 rounded-2xl text-white grid place-items-center font-heading font-bold text-xl shrink-0 ${live ? 'bg-brand-orange' : 'bg-zinc-800'}`}
                  >
                    {initials}
                  </div>

                  <div className="min-w-0">
                    {event && (
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        {live ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-brand-orange">
                            <span className="size-1.5 rounded-full bg-brand-orange animate-pulse" />
                            Ao vivo
                          </span>
                        ) : upcoming ? (
                          <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                            {formatDate(event.startsAt)} às{' '}
                            {formatStartsAt(event.startsAt)}
                          </span>
                        ) : null}
                        <span className="text-xs font-semibold text-zinc-600 truncate">
                          {event.championship}
                        </span>
                      </div>
                    )}

                    <h3 className="font-heading text-lg font-bold leading-tight mb-1 group-hover:text-brand-orange transition-colors truncate">
                      {bar.name}
                    </h3>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="size-3.5" />
                        {bar.distance_km.toFixed(1)} km · {bar.neighborhood}
                      </span>
                      {event && event.participants.length > 0 && (
                        <span className="text-zinc-500">
                          {event.participants
                            .map((p) => p.team.name)
                            .join(' × ')}
                        </span>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault()
                      favoriteMutation.mutate({ barId: bar.id })
                    }}
                    className="p-2.5 rounded-full bg-zinc-100 hover:bg-brand-orange/10 hover:text-brand-orange grid place-items-center shrink-0"
                  >
                    <Heart className="size-4" />
                  </button>
                </Link>
              )
            })}
          </div>

          {barsData?.nextCursor != null && (
            <div className="mt-6 text-center">
              <button className="px-6 py-2.5 rounded-full bg-zinc-100 text-sm font-bold text-zinc-700 hover:bg-zinc-200">
                Carregar mais
              </button>
            </div>
          )}
        </section>
      </div>
    </AppShell>
  )
}
