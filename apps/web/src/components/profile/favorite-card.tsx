import { Link } from '@tanstack/react-router'
import Heart from 'reicon-react/icons/Heart'
import Location from 'reicon-react/icons/Location'
import { formatProfileEventDate } from './profile-formatters'
import type { Favorite } from './profile-model'

type Props = {
  favorite: Favorite
  onUnfavorite: () => void
  isPending: boolean
}

export function FavoriteCard({ favorite, onUnfavorite, isPending }: Props) {
  const nextEvent = favorite.bar.events[0]

  return (
    <div className="group relative overflow-hidden rounded-none border border-[var(--onside-ink)] bg-[var(--onside-paper)] transition-[box-shadow] hover:shadow-sm">
      <Link
        to="/pub/$pubId"
        params={{ pubId: favorite.bar.id }}
        className="block p-4"
      >
        <div className="mb-1 truncate pr-6 font-bold text-base transition-colors group-hover:text-[var(--onside-live-text)]">
          {favorite.bar.name}
        </div>
        <div className="mb-3 flex items-center gap-1 text-[var(--onside-muted)] text-xs">
          <Location size={11} color="currentColor" />
          {favorite.bar.neighborhood}, {favorite.bar.city}
        </div>
        {nextEvent ? (
          <div className="rounded-none bg-[var(--onside-acid)]/8 px-3 py-2">
            <div className="mb-0.5 font-bold text-[10px] text-[var(--onside-live)] uppercase tracking-widest">
              {nextEvent.sport.name}
            </div>
            <div className="truncate font-bold text-[var(--onside-ink)] text-xs">
              {nextEvent.participants.length > 0
                ? nextEvent.participants
                    .map((participant) => participant.team.name)
                    .join(' × ')
                : nextEvent.participantFreeText || nextEvent.championship}
            </div>
            <div className="mt-0.5 text-[var(--onside-muted)] text-xs">
              {formatProfileEventDate(nextEvent.startsAt)}
            </div>
          </div>
        ) : (
          <div className="rounded-none bg-[var(--onside-stone)] px-3 py-2">
            <div className="text-[var(--onside-muted)] text-xs">
              Sem jogos agendados
            </div>
          </div>
        )}
      </Link>
      <button
        type="button"
        disabled={isPending}
        onClick={onUnfavorite}
        className="absolute top-3 right-3 grid size-7 place-items-center rounded-none text-[var(--onside-muted)] transition-colors hover:bg-[color-mix(in_srgb,var(--onside-live)_10%,var(--onside-paper))] hover:text-[var(--onside-live-text)] disabled:opacity-40"
        aria-label={`Remover ${favorite.bar.name} dos favoritos`}
      >
        <Heart size={14} color="currentColor" />
      </button>
    </div>
  )
}
