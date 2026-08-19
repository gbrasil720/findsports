import Calendar from 'reicon-react/icons/Calendar'
import { useMinuteNow } from '@/components/app/minute-tick'
import { getEventTemporalState } from '@/domain/events'
import {
  formatDayLabel,
  formatEventTime,
  formatMatchup,
  type ProfileEvent
} from '@/domain/pub-profile'

type Props = {
  event: ProfileEvent
  /** Verdadeiro quando o torcedor chegou por este jogo (`?eventId`). */
  fromSearch: boolean
}

function TeamCrest({
  name,
  logoUrl
}: {
  name: string
  logoUrl: string | null
}) {
  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt=""
        className="size-8 shrink-0 object-contain md:size-10"
        loading="lazy"
      />
    )
  }

  return (
    <span
      className="inline-flex size-8 shrink-0 items-center justify-center border-[1.5px] border-[var(--onside-ink)] bg-[var(--onside-stone)] font-[family-name:var(--onside-mono)] text-[10px] font-bold md:size-10"
      aria-hidden="true"
    >
      {name.slice(0, 2).toUpperCase()}
    </span>
  )
}

/**
 * O jogo no topo da página.
 *
 * O torcedor quase sempre chega por um jogo, não pelo bar. Confirmar em um
 * relance que é este o jogo — e que ele já está rolando, quando está — é o
 * que decide se ele continua lendo ou volta para a busca.
 */
export function HeroEventCard({ event, fromSearch }: Props) {
  // ESC-17: só este cartão re-renderiza na virada do minuto.
  const now = useMinuteNow()
  const isLive = getEventTemporalState(event.startsAt, now) === 'live'
  const teams = event.participants
    .map((item) => item.team)
    .filter((team): team is NonNullable<typeof team> => Boolean(team))

  return (
    <section
      className={`onside-panel p-5 md:p-6 ${isLive ? 'onside-shadow' : ''}`}
      aria-label="Jogo em destaque"
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {isLive ? (
          <span className="onside-badge onside-badge-live">
            <span className="onside-live-dot" aria-hidden="true" />
            Acontecendo agora
          </span>
        ) : (
          <span className="onside-badge onside-badge-ink">
            <Calendar size={12} color="currentColor" aria-hidden="true" />
            {formatDayLabel(event.startsAt, new Date(now))} ·{' '}
            {formatEventTime(event.startsAt)}
          </span>
        )}

        {fromSearch && (
          <span className="onside-badge onside-badge-stone">
            O jogo que você procurou
          </span>
        )}
      </div>

      <div className="flex items-center gap-3 md:gap-4">
        {teams.length > 0 && (
          <div className="flex shrink-0 items-center gap-2">
            {teams.map((team) => (
              <TeamCrest
                key={team.name}
                name={team.name}
                logoUrl={team.logoUrl}
              />
            ))}
          </div>
        )}

        <div className="min-w-0">
          <p className="onside-display text-2xl leading-tight md:text-3xl">
            {formatMatchup(event)}
          </p>
          <p className="mt-1 font-[family-name:var(--onside-mono)] text-[11px] uppercase tracking-[0.12em] text-[var(--onside-muted)]">
            {event.sport.name} · {event.championship}
          </p>
        </div>
      </div>
    </section>
  )
}
