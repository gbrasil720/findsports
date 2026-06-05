/** biome-ignore-all lint/a11y/useValidAriaRole: <explanation> */
import { useMutation, useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import {
  ArrowLeft,
  Calendar,
  Heart,
  Loader2,
  MapPin,
  Navigation,
  Phone,
  Share2
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { AppShell } from '@/components/app/app-shell'
import { GoogleMap } from '@/components/app/google-map'
import { useTRPC } from '@/utils/trpc'

export const Route = createFileRoute('/(pub)/pub/$pubId')({
  head: () => ({
    meta: [
      { title: 'Bar — FindSports' },
      {
        name: 'description',
        content: 'Veja os próximos jogos transmitidos neste bar.'
      }
    ]
  }),
  component: BarPage
})

const LIVE_WINDOW_MS = 3 * 60 * 60 * 1000

function isLive(startsAt: string | Date): boolean {
  const start = new Date(startsAt).getTime()
  const now = Date.now()
  return now >= start && now <= start + LIVE_WINDOW_MS
}

function formatEventTime(startsAt: string | Date): string {
  const d = new Date(startsAt)
  const today = new Date()
  const tomorrow = new Date()
  tomorrow.setDate(today.getDate() + 1)

  const time = d.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit'
  })

  if (d.toDateString() === today.toDateString()) return `Hoje · ${time}`
  if (d.toDateString() === tomorrow.toDateString()) return `Amanhã · ${time}`
  return (
    d.toLocaleDateString('pt-BR', {
      weekday: 'long',
      day: 'numeric',
      month: 'short'
    }) + ` · ${time}`
  )
}

function BarPage() {
  const { pubId } = Route.useParams()
  const navigate = useNavigate()
  const trpc = useTRPC()

  const [, setTick] = useState(0)
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 60_000)
    return () => clearInterval(interval)
  }, [])

  const {
    data: bar,
    isLoading,
    isError
  } = useQuery(trpc.pubs.getById.queryOptions({ id: pubId }))

  const favoriteMutation = useMutation(trpc.pubs.favorite.mutationOptions())
  const unfavoriteMutation = useMutation(trpc.pubs.unfavorite.mutationOptions())

  if (isLoading) {
    return (
      <AppShell role="fan" userName={''} userMeta={''}>
        <div className="flex items-center justify-center py-24 text-zinc-400">
          <Loader2 className="size-6 animate-spin mr-2" />
          <span className="text-sm">Carregando...</span>
        </div>
      </AppShell>
    )
  }

  if (isError || !bar) {
    return (
      <AppShell
        role="fan"
        userName={bar?.name ?? ''}
        userMeta={bar?.description ?? ''}
      >
        <div className="py-24 text-center">
          <p className="font-semibold text-zinc-600 mb-3">
            Bar não encontrado.
          </p>
          <Link
            to="/dashboard"
            className="text-sm font-bold text-brand-orange hover:underline"
          >
            Voltar para o início
          </Link>
        </div>
      </AppShell>
    )
  }

  const liveEvent = bar.events.find((e) => isLive(e.startsAt))
  const upcomingEvents = bar.events.filter((e) => !isLive(e.startsAt))

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({ title: bar.name, url: window.location.href })
    } else {
      navigator.clipboard.writeText(window.location.href)
    }
  }

  const handleDirections = () => {
    const query = encodeURIComponent(
      `${bar.name}, ${bar.address}, ${bar.neighborhood}`
    )
    window.open(
      `https://www.google.com/maps/search/?api=1&query=${query}`,
      '_blank'
    )
  }

  return (
    <AppShell role="fan" userName={''} userMeta={''}>
      <Link
        to="/dashboard"
        className="inline-flex items-center gap-2 text-sm font-bold text-zinc-500 hover:text-black mb-4"
      >
        <ArrowLeft className="size-4" /> Voltar
      </Link>

      <section className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-zinc-900 via-black to-zinc-900 text-white mb-8">
        <div className="absolute inset-0 opacity-30 bg-[radial-gradient(circle_at_30%_20%,rgba(255,90,31,0.6),transparent_40%),radial-gradient(circle_at_80%_80%,rgba(30,107,255,0.5),transparent_45%)]" />
        <div className="relative p-8 md:p-10 grid md:grid-cols-[1fr_auto] gap-6 items-end">
          <div>
            {liveEvent && (
              <div className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.25em] text-brand-orange mb-3">
                <span className="size-1.5 rounded-full bg-brand-orange animate-pulse" />
                Ao vivo ·{' '}
                {liveEvent.participants.length > 0
                  ? liveEvent.participants.map((p) => p.team.name).join(' × ')
                  : liveEvent.championship}
              </div>
            )}
            <h1 className="font-heading text-4xl md:text-5xl font-bold tracking-tight leading-[0.95] mb-3">
              {bar.name}
            </h1>
            <div className="flex flex-wrap items-center gap-4 text-sm text-white/80">
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="size-4" />
                {bar.address} · {bar.neighborhood}
              </span>
              {bar.phone && (
                <span className="inline-flex items-center gap-1.5">
                  <Phone className="size-4" /> {bar.phone}
                </span>
              )}
            </div>
            {bar.description && (
              <p className="text-sm text-white/60 mt-3 max-w-lg">
                {bar.description}
              </p>
            )}
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleDirections}
              className="bg-brand-orange text-white text-sm font-bold px-5 py-3 rounded-full hover:scale-105 transition-transform shadow-[0_8px_30px_-6px_rgba(255,90,31,0.7)] inline-flex items-center gap-2"
            >
              <Navigation className="size-4" /> Como chegar
            </button>
            <button
              type="button"
              onClick={() => favoriteMutation.mutate({ barId: bar.id })}
              className="p-3 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur"
            >
              <Heart className="size-4" />
            </button>
            <button
              type="button"
              onClick={handleShare}
              className="p-3 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur"
            >
              <Share2 className="size-4" />
            </button>
          </div>
        </div>
      </section>

      <div className="grid lg:grid-cols-[1fr_340px] gap-8">
        <div className="space-y-8 min-w-0">
          <section className="bg-white rounded-2xl ring-1 ring-black/5 p-6 md:p-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-heading text-2xl font-bold flex items-center gap-2">
                <Calendar className="size-5 text-brand-blue" />
                Próximos jogos transmitidos
              </h2>
            </div>

            {bar.events.length === 0 ? (
              <p className="text-sm text-zinc-500 py-4">
                Nenhum jogo cadastrado ainda.
              </p>
            ) : (
              <ul className="divide-y divide-zinc-100">
                {liveEvent && (
                  <li
                    key={liveEvent.id}
                    className="py-4 flex items-center gap-4"
                  >
                    <span className="size-2 rounded-full bg-brand-orange animate-pulse shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] font-bold uppercase tracking-widest text-brand-orange mb-0.5">
                        {liveEvent.sport.name} · {liveEvent.championship}
                      </div>
                      <div className="font-semibold truncate">
                        {liveEvent.participants.length > 0
                          ? liveEvent.participants
                              .map((p) => p.team.name)
                              .join(' × ')
                          : liveEvent.championship}
                      </div>
                    </div>
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-brand-orange whitespace-nowrap">
                      <span className="size-1.5 rounded-full bg-brand-orange animate-pulse" />
                      Ao vivo
                    </span>
                  </li>
                )}

                {upcomingEvents.map((e) => (
                  <li key={e.id} className="py-4 flex items-center gap-4">
                    <span className="size-2 rounded-full bg-zinc-300 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] font-bold uppercase tracking-widest text-brand-orange mb-0.5">
                        {e.sport.name} · {e.championship}
                      </div>
                      <div className="font-semibold truncate">
                        {e.participants.length > 0
                          ? e.participants.map((p) => p.team.name).join(' × ')
                          : e.championship}
                      </div>
                    </div>
                    <div className="text-xs font-bold text-zinc-500 whitespace-nowrap">
                      {formatEventTime(e.startsAt)}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="space-y-6">
          <section className="bg-white rounded-2xl ring-1 ring-black/5 p-5">
            <h3 className="font-heading text-lg font-bold mb-4">Informações</h3>
            <ul className="space-y-3 text-sm">
              <li className="flex items-start gap-3 text-zinc-700">
                <MapPin className="size-4 text-zinc-400 mt-0.5 shrink-0" />
                {bar.address}, {bar.neighborhood}, {bar.city}
              </li>
              {bar.phone && (
                <li className="flex items-center gap-3 text-zinc-700">
                  <Phone className="size-4 text-zinc-400 shrink-0" />
                  {bar.phone}
                </li>
              )}
            </ul>
          </section>

          <section className="bg-white rounded-2xl ring-1 ring-black/5 p-5">
            <h3 className="font-heading text-lg font-bold mb-3 flex items-center gap-2">
              <MapPin className="size-4 text-brand-orange" /> Localização
            </h3>
            <div className="relative h-44 rounded-xl overflow-hidden bg-zinc-100">
              <GoogleMap
                center={{
                  lat: parseFloat(bar.latitude),
                  lng: parseFloat(bar.longitude)
                }}
                bars={[
                  {
                    id: bar.id,
                    name: bar.name,
                    lat: parseFloat(bar.latitude),
                    lng: parseFloat(bar.longitude),
                    accent: 'orange',
                    occupancy: 0
                  }
                ]}
              />
            </div>
            <button
              type="button"
              onClick={handleDirections}
              className="w-full mt-3 bg-black text-white text-xs font-bold py-2.5 rounded-full hover:bg-brand-orange transition-colors"
            >
              Como chegar
            </button>
          </section>
        </aside>
      </div>
    </AppShell>
  )
}
