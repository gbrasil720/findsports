import { CalendarsIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'

type Participant = { team: { name: string } }

type Event = {
  id: string
  championship: string
  startsAt: string
  sport: { name: string; slug: string }
  participants: Participant[]
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

type Props = {
  liveEvent?: Event
  upcomingEvents: Event[]
  allEvents: Event[]
}

export function EventsList({ liveEvent, upcomingEvents, allEvents }: Props) {
  return (
    <section className="bg-white rounded-2xl ring-1 ring-black/5 p-6 md:p-8">
      <div className="flex items-center justify-between mb-6">
        <h2 className="font-heading text-2xl font-bold flex items-center gap-2">
          <HugeiconsIcon
            icon={CalendarsIcon}
            size={20}
            color="currentColor"
            strokeWidth={1.5}
            className="text-brand-blue"
          />
          Próximos jogos transmitidos
        </h2>
      </div>

      {allEvents.length === 0 ? (
        <p className="text-sm text-zinc-500 py-4">
          Nenhum jogo cadastrado ainda.
        </p>
      ) : (
        <ul className="divide-y divide-zinc-100">
          {liveEvent && (
            <li key={liveEvent.id} className="py-4 flex items-center gap-4">
              <span className="size-2 rounded-full bg-brand-orange animate-pulse shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-widest text-brand-orange mb-0.5">
                  {liveEvent.sport.name} · {liveEvent.championship}
                </div>
                <div className="font-semibold truncate">
                  {liveEvent.participants.length > 0
                    ? liveEvent.participants.map((p) => p.team.name).join(' × ')
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
  )
}
