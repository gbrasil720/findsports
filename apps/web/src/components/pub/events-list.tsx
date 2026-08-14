import Calendar from 'reicon-react/icons/Calendar'

type Participant = { team: { name: string } }

type Event = {
  id: string
  championship: string
  startsAt: string
  sport: { name: string; slug: string }
  participants: Participant[]
  participantFreeText?: string | null
}

function describeParticipants(e: Event): string {
  if (e.participants.length > 0)
    return e.participants.map((p) => p.team.name).join(' × ')
  return e.participantFreeText || e.championship
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
  return `${d.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'short'
  })} · ${time}`
}

type Props = {
  liveEvent?: Event
  upcomingEvents: Event[]
  allEvents: Event[]
}

export function EventsList({ liveEvent, upcomingEvents, allEvents }: Props) {
  return (
    <section className="onside-panel p-6 md:p-8">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="onside-display flex items-center gap-2 text-2xl">
          <Calendar
            size={20}
            color="currentColor"
            className="text-[var(--onside-live)]"
            aria-hidden="true"
          />
          Próximos jogos transmitidos
        </h2>
      </div>

      {allEvents.length === 0 ? (
        <p className="py-4 text-[var(--onside-muted)] text-sm">
          Nenhum jogo cadastrado ainda.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--onside-line)]">
          {liveEvent && (
            <li
              key={liveEvent.id}
              className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 py-4"
            >
              <span
                className="onside-live-dot is-pulse shrink-0"
                aria-hidden="true"
              />
              <div className="min-w-0">
                <div className="mb-0.5 font-[family-name:var(--onside-mono)] text-[10px] font-bold text-[var(--onside-live)] uppercase tracking-widest">
                  {liveEvent.sport.name} · {liveEvent.championship}
                </div>
                <div className="truncate font-semibold">
                  {describeParticipants(liveEvent)}
                </div>
              </div>
              <span className="onside-badge onside-badge-live whitespace-nowrap">
                Ao vivo
              </span>
            </li>
          )}

          {upcomingEvents.map((e) => (
            <li
              key={e.id}
              className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 py-4"
            >
              <span
                className="size-2 shrink-0 bg-[var(--onside-ink)]"
                aria-hidden="true"
              />
              <div className="min-w-0">
                <div className="mb-0.5 font-[family-name:var(--onside-mono)] text-[10px] font-bold text-[var(--onside-muted)] uppercase tracking-widest">
                  {e.sport.name} · {e.championship}
                </div>
                <div className="truncate font-semibold">
                  {describeParticipants(e)}
                </div>
              </div>
              <div className="whitespace-nowrap font-bold text-[var(--onside-muted)] text-xs tabular-nums">
                {formatEventTime(e.startsAt)}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
