import Edit from 'reicon-react/icons/Edit'
import Trash from 'reicon-react/icons/Trash'
import { getEventTemporalState } from '@/domain/events'
import {
  formatDayLabel,
  formatEventTime,
  formatGameSubtitle
} from '@/domain/pub-profile'
import type { AdminEvent } from './admin-model'
import { getDeleteBlock } from './event-delete-dialog'

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

type Props = {
  event: AdminEvent
  /** Presenças do jogo sobre a média do bar; ausente sem histórico. */
  interestRatio?: number
  onEdit: (id: string) => void
  onDelete: (id: string) => void
  isDeleting: boolean
}

export function EventListItem({
  event: e,
  interestRatio,
  onEdit,
  onDelete,
  isDeleting
}: Props) {
  const startsAt = new Date(e.startsAt)
  const temporalState = getEventTemporalState(e.startsAt, e.endsAt)
  const live = temporalState === 'live'
  const past = temporalState === 'past'
  const soon = !live && !past && isUpcomingSoon(e.startsAt)
  const timeUntil = soon ? getTimeUntil(e.startsAt) : null
  const title =
    e.participants?.map((p) => p.team.name).join(' × ') ||
    e.participantFreeText ||
    e.championship
  // Bloqueado, a lixeira continua ali: o clique abre o motivo (WEB-252).
  const deleteBlock = getDeleteBlock(e.deletion)

  return (
    // Encerrado sem `opacity-80`: o stone já apaga a linha, e com a opacidade
    // por cima o texto cinza caía para 3,77:1.
    <li
      className={`onside-event-row ${
        live ? 'onside-event-row-live' : past ? 'onside-event-row-past' : ''
      }`}
    >
      <div className="text-center">
        <div className="mb-1 font-[family-name:var(--onside-mono)] text-[10px] font-bold text-[var(--onside-muted)] uppercase tracking-widest leading-none">
          {formatDayLabel(startsAt, undefined, 'short')}
        </div>
        <div
          className={`onside-display text-xl tabular-nums ${
            past ? 'text-[var(--onside-muted)]' : 'text-[var(--onside-ink)]'
          }`}
        >
          {formatEventTime(startsAt)}
        </div>
        {live && (
          <div className="mt-1.5 flex items-center justify-center gap-1">
            <span className="onside-live-dot is-pulse" aria-hidden="true" />
            <span className="font-[family-name:var(--onside-mono)] text-[9px] font-black text-[var(--onside-ink)] uppercase tracking-wider">
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
            {formatGameSubtitle(title, [e.championship])}
          </span>
        </div>
        <div
          className={`truncate font-semibold text-base leading-snug ${
            past ? 'text-[var(--onside-muted)]' : 'text-[var(--onside-ink)]'
          }`}
        >
          {title}
        </div>
        {interestRatio !== undefined && (
          <div className="mt-1 text-[var(--onside-muted)] text-xs">
            Interesse: {interestRatio.toLocaleString('pt-BR')}x a média deste
            bar
          </div>
        )}
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
          title={deleteBlock?.reason}
          className={`grid min-h-11 min-w-11 place-items-center border border-[var(--onside-ink)] disabled:opacity-40 ${
            deleteBlock
              ? 'text-[var(--onside-muted)] hover:bg-[var(--onside-stone)]'
              : 'text-[var(--onside-live)] hover:bg-[color-mix(in_srgb,var(--onside-live)_10%,var(--onside-paper))]'
          }`}
        >
          <Trash size={16} color="currentColor" aria-hidden="true" />
        </button>
      </div>
    </li>
  )
}
