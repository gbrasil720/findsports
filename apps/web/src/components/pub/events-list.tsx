import type {
  event,
  eventParticipants,
  sport,
  team
} from '@findsports_oficial/db/schema/platform'
import type { InferSelectModel } from 'drizzle-orm'
import Calendar from 'reicon-react/icons/Calendar'
import Clock from 'reicon-react/icons/Clock'

type EventWithRelations = InferSelectModel<typeof event> & {
  sport: InferSelectModel<typeof sport>
  participants: (InferSelectModel<typeof eventParticipants> & {
    team: InferSelectModel<typeof team>
  })[]
}

type Props = {
  events: EventWithRelations[]
}

export function EventsList({ events }: Props) {
  if (!events.length) return null

  return (
    <section className="onside-panel p-6">
      <h2 className="onside-display mb-4 text-xl">Próximos jogos</h2>
      <div className="space-y-3">
        {events.map((ev) => {
          const teams = ev.participants
            .map((p) => p.team?.name)
            .filter(Boolean)
            .join(' vs ')

          return (
            <div
              key={ev.id}
              className="onside-panel-inner flex items-center gap-4 p-4"
            >
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[var(--onside-stone)]">
                <Calendar size={18} color="currentColor" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="onside-text-on-paper text-sm font-medium truncate">
                  {teams || ev.participantFreeText || ev.championship}
                </p>
                <p className="onside-text-muted-on-paper text-xs">
                  {ev.sport.name} — {ev.championship}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <div className="flex items-center gap-1 font-[family-name:var(--onside-mono)] text-xs text-[var(--onside-muted)]">
                  <Clock size={12} color="currentColor" aria-hidden="true" />
                  {new Date(ev.startsAt).toLocaleDateString('pt-BR', {
                    day: '2-digit',
                    month: 'short'
                  })}
                </div>
                <div className="font-[family-name:var(--onside-mono)] text-xs text-[var(--onside-muted)]">
                  {new Date(ev.startsAt).toLocaleTimeString('pt-BR', {
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
