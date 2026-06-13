import { EyeIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useQuery } from '@tanstack/react-query'
import { GoogleMap } from '@/components/app/google-map'
import { BarCard } from '@/components/dashboard/bar-card'
import { useTRPC } from '@/utils/trpc'

type Bar = {
  id: string
  name: string
  neighborhood: string
  city: string
  latitude: string
  longitude: string
  photo_url?: string | null
  plan?: 'starter' | 'pro' | 'elite'
}

type Props = {
  bar: Bar
}

export function BarPreview({ bar }: Props) {
  const trpc = useTRPC()

  const { data: events = [] } = useQuery(trpc.pub.getMyEvents.queryOptions())
  const { data: subscription } = useQuery(
    trpc.pub.getMySubscription.queryOptions()
  )

  const plan = (subscription?.plan ?? 'starter') as 'starter' | 'pro' | 'elite'

  const LIVE_WINDOW_MS = 3 * 60 * 60 * 1000
  const nextEvent = events
    .filter((e) => new Date(e.startsAt).getTime() + LIVE_WINDOW_MS > Date.now())
    .sort(
      (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()
    )[0]

  // Monta o bar no formato que o BarCard espera
  const previewBar = {
    id: bar.id,
    name: bar.name,
    neighborhood: bar.neighborhood,
    city: bar.city,
    latitude: bar.latitude,
    longitude: bar.longitude,
    photo_url: bar.photo_url,
    distance_km: 0,
    plan,
    event_count: events.length,
    nextEvent: nextEvent
      ? {
          id: nextEvent.id,
          championship: nextEvent.championship,
          startsAt: nextEvent.startsAt.toString(),
          sport: {
            name: nextEvent.sport?.name ?? '',
            slug: nextEvent.sport?.slug ?? ''
          },
          participants: (nextEvent.participants ?? []).map((p: any) => ({
            team: { name: p.team.name, logoUrl: p.team.logoUrl ?? null }
          }))
        }
      : undefined
  }

  const lat = parseFloat(bar.latitude)
  const lng = parseFloat(bar.longitude)

  const mapAccent = plan === 'pro' || plan === 'elite' ? 'blue' : 'black'

  return (
    <section className="mb-8">
      <div className="flex items-center gap-2 mb-4">
        <h2 className="font-heading text-2xl font-bold flex items-center gap-2">
          <HugeiconsIcon
            icon={EyeIcon}
            size={20}
            color="currentColor"
            strokeWidth={1.5}
            className="text-brand-blue"
          />
          Como você é visto
        </h2>
      </div>

      <div className="grid md:grid-cols-[1fr_1fr] gap-4">
        {/* Card preview */}
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-400 mb-3">
            Card na listagem
          </p>
          <BarCard
            bar={previewBar}
            isHovered={false}
            isFavorite={false}
            onMouseEnter={() => {}}
            onMouseLeave={() => {}}
            onFavorite={() => {}}
          />
        </div>

        {/* Mapa preview */}
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-400 mb-3">
            Pin no mapa
          </p>
          <div className="relative h-[180px] rounded-2xl overflow-hidden ring-1 ring-black/5">
            <GoogleMap
              bars={[
                {
                  id: bar.id,
                  name: bar.name,
                  lat,
                  lng,
                  accent: mapAccent,
                  occupancy: 0
                }
              ]}
              center={{ lat, lng }}
            />
          </div>
          {plan === 'starter' && (
            <p className="text-xs text-zinc-400 mt-2">
              Pin padrão · Faça upgrade para Pro e ganhe pin destacado no mapa.
            </p>
          )}
          {(plan === 'pro' || plan === 'elite') && (
            <p className="text-xs text-brand-blue mt-2 font-semibold">
              ✓ Pin destacado ativo
            </p>
          )}
        </div>
      </div>
    </section>
  )
}
