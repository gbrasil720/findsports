import Edit from 'reicon-react/icons/Edit'
import Trash from 'reicon-react/icons/Trash'
import { getEventTemporalState } from '@/domain/events'
import type { AdminEvent } from './admin-model'

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
  event: AdminEvent
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
  const temporalState = getEventTemporalState(e.startsAt)
  const live = temporalState === 'live'
  const past = temporalState === 'past'
  const soon = !live && !past && isUpcomingSoon(e.startsAt)
  const timeUntil = soon ? getTimeUntil(e.startsAt) : null
  const participants =
    e.participants?.map((p) => p.team.name).join(' × ') || e.participantFreeText

  return (
    <li
      className={`onside-event-row ${
        live
          ? 'border-[var(--onside-live)] bg-[color-mix(in_srgb,var(--onside-live)_8%,var(--onside-paper))]'
          : past
            ? 'bg-[var(--onside-stone)] opacity-80'
            : 'bg-[var(--onside-paper)]'
      }`}
    >
      <div className="text-center">
        <div className="mb-1 font-[family-name:var(--onside-mono)] text-[10px] font-bold text-[var(--onside-muted)] uppercase tracking-widest leading-none">
          {date}
        </div>
        <div
          className={`onside-display text-xl tabular-nums leading-none ${
            past ? 'text-[var(--onside-muted)]' : 'text-[var(--onside-ink)]'
          }`}
        >
          {time}
        </div>
        {live && (
          <div className="mt-1.5 flex items-center justify-center gap-1">
            <span className="onside-live-dot is-pulse" aria-hidden="true" />
            <span className="font-[family-name:var(--onside-mono)] text-[9px] font-black text-[var(--onside-live)] uppercase tracking-wider">
              Ao vivo
            </span>
          </div>
        )}
        {soon && timeUntil && (
          <div className="mt-1.5 font-[family-name:var(--onside-mono)] text-[9px] font-bold text-[var(--onside-ink)] tabular-nums">
            {timeUntil}
          </div>
        )}
      </div>

      <div className="min-w-0">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <span
            className={`onside-badge ${
              live
                ? 'onside-badge-live'
                : past
                  ? 'onside-badge-stone'
                  : 'onside-badge-ink'
            }`}
          >
            {live ? 'AO VIVO' : past ? 'ENCERRADO' : 'PROGRAMADO'}
          </span>
          <span className="font-[family-name:var(--onside-mono)] text-[10px] text-[var(--onside-muted)] uppercase tracking-wider">
            {e.sport?.name}
          </span>
          <span className="truncate text-[10px] text-[var(--onside-muted)]">
            {e.championship}
          </span>
        </div>
        <div
          className={`truncate font-semibold text-base leading-snug ${
            past ? 'text-[var(--onside-muted)]' : 'text-[var(--onside-ink)]'
          }`}
        >
          {participants || e.championship}
        </div>
      </div>

      <div className="flex shrink-0 gap-1">
        <button
          type="button"
          onClick={() => onEdit(e.id)}
          aria-label="Editar evento"
          className="grid min-h-11 min-w-11 place-items-center border border-[var(--onside-ink)] hover:bg-[var(--onside-stone)]"
        >
          <Edit
            size={16}
            color="currentColor"
            className="text-[var(--onside-ink)]"
            aria-hidden="true"
          />
        </button>
        <button
          type="button"
          onClick={() => onDelete(e.id)}
          disabled={isDeleting}
          aria-label="Excluir evento"
          className="grid min-h-11 min-w-11 place-items-center border border-[var(--onside-ink)] text-[var(--onside-live)] hover:bg-[color-mix(in_srgb,var(--onside-live)_10%,var(--onside-paper))] disabled:opacity-40"
        >
          <Trash size={16} color="currentColor" aria-hidden="true" />
        </button>
      </div>
    </li>
  )
}
