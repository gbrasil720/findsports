import { DeleteThrowIcon, PencilIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'

type EventItem = {
  id: string
  startsAt: string
  championship: string
  sport?: { name: string }
  participants?: { team: { name: string } }[]
}

const LIVE_WINDOW_MS = 3 * 60 * 60 * 1000

function isLive(startsAt: string | Date): boolean {
  const start = new Date(startsAt).getTime()
  const now = Date.now()
  return now >= start && now <= start + LIVE_WINDOW_MS
}

function isPast(startsAt: string | Date): boolean {
  return new Date(startsAt).getTime() + LIVE_WINDOW_MS < Date.now()
}

function isUpcomingSoon(startsAt: string | Date): boolean {
  const diff = new Date(startsAt).getTime() - Date.now()
  return diff > 0 && diff < 24 * 60 * 60 * 1000
}

function getTimeUntil(startsAt: string | Date): string {
  const diff = new Date(startsAt).getTime() - Date.now()
  if (diff <= 0) return ''
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `em ${mins}min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `em ${hours}h`
  const days = Math.floor(hours / 24)
  return `em ${days} dia${days !== 1 ? 's' : ''}`
}

function formatEventDate(startsAt: string | Date): {
  date: string
  time: string
} {
  const d = new Date(startsAt)
  const today = new Date()
  const tomorrow = new Date()
  tomorrow.setDate(today.getDate() + 1)

  let date: string
  if (d.toDateString() === today.toDateString()) date = 'Hoje'
  else if (d.toDateString() === tomorrow.toDateString()) date = 'Amanhã'
  else
    date = d.toLocaleDateString('pt-BR', {
      weekday: 'short',
      day: 'numeric',
      month: 'short'
    })

  const time = d.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit'
  })
  return { date, time }
}

type Props = {
  event: EventItem
  onEdit: (id: string) => void
  onDelete: (id: string) => void
  isDeleting: boolean
}

export function EventListItem({
  event: e,
  onEdit,
  onDelete,
  isDeleting
}: Props) {
  const { date, time } = formatEventDate(e.startsAt)
  const live = isLive(e.startsAt)
  const past = isPast(e.startsAt)
  const soon = !live && !past && isUpcomingSoon(e.startsAt)
  const timeUntil = soon ? getTimeUntil(e.startsAt) : null
  const participants = e.participants?.map((p) => p.team.name).join(' × ')

  return (
    <li
      className={`group relative rounded-xl overflow-hidden transition-all duration-200 ${
        live
          ? 'bg-gradient-to-r from-orange-50 to-white ring-1 ring-orange-200 shadow-sm shadow-orange-100/50'
          : past
            ? 'bg-zinc-50 ring-1 ring-zinc-100'
            : 'bg-white ring-1 ring-zinc-100 hover:ring-zinc-200 hover:shadow-sm'
      }`}
    >
      {live && (
        <div className="absolute left-0 inset-y-0 w-1 bg-gradient-to-b from-brand-orange to-orange-400 rounded-l-xl" />
      )}

      <div
        className={`flex items-center gap-4 px-4 py-3.5 ${live ? 'pl-5' : ''}`}
      >
        <div className="text-center w-14 shrink-0">
          <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 leading-none mb-1">
            {date}
          </div>
          <div
            className={`font-heading font-bold text-xl tabular-nums leading-none ${
              past ? 'text-zinc-400' : 'text-zinc-900'
            }`}
          >
            {time}
          </div>
          {live && (
            <div className="flex items-center justify-center gap-1 mt-1.5">
              <span className="size-1.5 rounded-full bg-brand-orange animate-pulse" />
              <span className="text-[9px] font-black uppercase tracking-wider text-brand-orange">
                Live
              </span>
            </div>
          )}
          {soon && timeUntil && (
            <div className="text-[9px] font-bold text-brand-blue mt-1.5 tabular-nums">
              {timeUntil}
            </div>
          )}
        </div>

        <div
          className={`w-px self-stretch ${live ? 'bg-orange-200' : 'bg-zinc-100'}`}
        />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span
              className={`inline-block text-[9px] font-black uppercase tracking-[0.2em] px-2 py-0.5 rounded-full ${
                live
                  ? 'bg-orange-100 text-brand-orange'
                  : 'bg-zinc-100 text-zinc-500'
              }`}
            >
              {e.sport?.name}
            </span>
            <span className="text-[10px] text-zinc-400 truncate">
              {e.championship}
            </span>
          </div>
          <div
            className={`font-heading font-semibold text-base leading-snug truncate ${
              past ? 'text-zinc-400' : 'text-zinc-900'
            }`}
          >
            {participants || e.championship}
          </div>
        </div>

        <div
          className={`flex gap-1 shrink-0 transition-opacity duration-150 ${
            past ? 'opacity-40' : 'opacity-0 group-hover:opacity-100'
          }`}
        >
          <button
            type="button"
            onClick={() => onEdit(e.id)}
            className="p-2 rounded-lg hover:bg-zinc-100 transition-colors"
          >
            <HugeiconsIcon icon={PencilIcon} size={16} color="currentColor" strokeWidth={1.5} className="text-zinc-600" />
          </button>
          <button
            type="button"
            onClick={() => onDelete(e.id)}
            disabled={isDeleting}
            className="p-2 rounded-lg hover:bg-red-50 hover:text-red-500 transition-colors disabled:opacity-40"
          >
            <HugeiconsIcon icon={DeleteThrowIcon} size={16} color="currentColor" strokeWidth={1.5} />
          </button>
        </div>
      </div>
    </li>
  )
}
