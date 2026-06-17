import { FavouriteIcon, MapPinIcon, StarIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Link } from '@tanstack/react-router'
import { analytics } from '@/lib/analytics'

type ApiEvent = {
  id: string
  championship: string
  startsAt: string
  sport: { name: string; slug: string }
  participants: { team: { name: string; logoUrl?: string | null } }[]
}

type Bar = {
  id: string
  name: string
  neighborhood: string
  distance_km: number
  latitude: string
  longitude: string
  photo_url?: string | null
  created_at?: string
  event_count?: number
  plan?: 'starter' | 'pro' | 'elite'
  nextEvent?: ApiEvent
}

function isLive(startsAt: string | Date): boolean {
  const LIVE_WINDOW_MS = 3 * 60 * 60 * 1000
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

function isNew(createdAt?: string): boolean {
  if (!createdAt) return false
  return Date.now() - new Date(createdAt).getTime() < 30 * 24 * 60 * 60 * 1000
}

const SPORT_COLORS: Record<string, string> = {
  futebol: 'bg-emerald-500',
  basketball: 'bg-orange-500',
  volei: 'bg-yellow-500',
  tenis: 'bg-lime-500',
  mma: 'bg-red-500',
  formula1: 'bg-red-600',
  formula_1: 'bg-red-600'
}

function SportBadge({ slug, name }: { slug: string; name: string }) {
  const color = SPORT_COLORS[slug] ?? 'bg-brand-blue'
  const initials = name.slice(0, 2).toUpperCase()
  return (
    <span
      className={`inline-flex items-center justify-center size-4 rounded-full text-[8px] font-bold text-white shrink-0 ${color}`}
      title={name}
    >
      {initials}
    </span>
  )
}

const PLAN_CONFIG = {
  elite: {
    ring: 'ring-amber-400/60',
    ringHover: 'hover:ring-amber-400/80',
    ringHovered: 'ring-amber-400 shadow-lg shadow-amber-100',
    badge: 'bg-amber-400 text-black',
    label: 'Elite'
  },
  pro: {
    ring: 'ring-brand-blue/30',
    ringHover: 'hover:ring-brand-blue/50',
    ringHovered: 'ring-brand-blue/60 shadow-lg shadow-blue-50',
    badge: 'bg-brand-blue text-white',
    label: 'Pro'
  },
  starter: null
} as const

type Props = {
  bar: Bar
  isHovered: boolean
  isFavorite: boolean
  onMouseEnter: () => void
  onMouseLeave: () => void
  onFavorite: (barId: string) => void
}

export function BarCard({
  bar,
  isHovered,
  isFavorite,
  onMouseEnter,
  onMouseLeave,
  onFavorite
}: Props) {
  const event = bar.nextEvent
  const live = event ? isLive(event.startsAt) : false
  const upcoming = event ? isUpcoming(event.startsAt) : false
  const extraEvents = (bar.event_count ?? 0) - 1
  const newBar = isNew(bar.created_at)
  const plan = bar.plan ?? 'starter'
  const planConfig = PLAN_CONFIG[plan]

  const initials = bar.name
    .split(' ')
    .map((w: string) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  const ringClass = isHovered
    ? planConfig
      ? planConfig.ringHovered
      : 'ring-brand-orange/50 shadow-lg'
    : live
      ? 'ring-brand-orange/30 hover:ring-brand-orange/50'
      : planConfig
        ? `${planConfig.ring} ${planConfig.ringHover}`
        : 'ring-black/5 hover:ring-brand-orange/30'

  return (
    <Link
      to="/pub/$pubId"
      params={{ pubId: bar.id }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={() => analytics.barCardClicked(bar.id, plan)}
      className={`group relative bg-white rounded-2xl ring-1 transition-all p-4 grid grid-cols-[auto_1fr_auto] gap-4 items-center ${ringClass}`}
    >
      {planConfig && (
        <span
          className={`absolute top-3 right-14 inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${planConfig.badge}`}
        >
          <HugeiconsIcon
            icon={StarIcon}
            size={9}
            color="currentColor"
            strokeWidth={2}
          />
          {planConfig.label}
        </span>
      )}

      <div
        className={`size-16 rounded-2xl text-white grid place-items-center font-heading font-bold text-xl shrink-0 overflow-hidden ${
          live
            ? 'bg-brand-orange'
            : plan === 'elite'
              ? 'bg-gradient-to-br from-amber-400 to-amber-600'
              : plan === 'pro'
                ? 'bg-gradient-to-br from-brand-blue to-blue-700'
                : 'bg-zinc-800'
        }`}
      >
        {bar.photo_url ? (
          <img
            src={bar.photo_url}
            alt={bar.name}
            className="size-full object-cover"
          />
        ) : (
          initials
        )}
      </div>

      <div className="min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          {event ? (
            live ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-brand-orange">
                <span className="size-1.5 rounded-full bg-brand-orange animate-pulse" />
                Ao vivo
              </span>
            ) : upcoming ? (
              <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                {formatDate(event.startsAt)} às {formatStartsAt(event.startsAt)}
              </span>
            ) : null
          ) : (
            <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">
              Sem eventos programados
            </span>
          )}
          {newBar && (
            <span className="inline-flex items-center text-[9px] font-bold uppercase tracking-widest text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full">
              Novo
            </span>
          )}
        </div>

        <h3 className="font-heading text-lg font-bold leading-tight mb-1 group-hover:text-brand-orange transition-colors truncate">
          {bar.name}
        </h3>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="inline-flex items-center gap-1 text-sm font-bold text-zinc-700">
            <HugeiconsIcon
              icon={MapPinIcon}
              size={14}
              color="currentColor"
              strokeWidth={1.5}
            />
            {bar.distance_km.toFixed(1)} km
          </span>
          <span className="text-xs text-zinc-400">{bar.neighborhood}</span>
          {event && (
            <span className="inline-flex items-center gap-1.5 text-xs text-zinc-500 truncate">
              <SportBadge slug={event.sport.slug} name={event.sport.name} />
              <span className="truncate">{event.championship}</span>
            </span>
          )}
          {event && event.participants.length > 0 && (
            <span className="text-xs text-zinc-400 truncate">
              {event.participants.map((p) => p.team.name).join(' × ')}
            </span>
          )}
          {extraEvents > 0 && (
            <span className="inline-flex items-center text-[10px] font-bold text-brand-blue bg-brand-blue/10 px-2 py-0.5 rounded-full shrink-0">
              +{extraEvents} {extraEvents === 1 ? 'jogo' : 'jogos'}
            </span>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={(e) => {
          e.preventDefault()
          onFavorite(bar.id)
        }}
        className={`p-3 rounded-full grid place-items-center shrink-0 transition-colors min-h-[44px] min-w-[44px] ${
          isFavorite
            ? 'bg-red-50 text-red-500 hover:bg-red-100'
            : 'bg-zinc-100 hover:bg-brand-orange/10 hover:text-brand-orange'
        }`}
      >
        <HugeiconsIcon
          icon={FavouriteIcon}
          size={16}
          color="currentColor"
          strokeWidth={1.5}
          fill={isFavorite ? 'currentColor' : 'none'}
        />
      </button>
    </Link>
  )
}
