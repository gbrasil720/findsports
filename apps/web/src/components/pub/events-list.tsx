import Chat from 'reicon-react/icons/Chat'
import { useMinuteNow } from '@/components/app/minute-tick'
import { getEventTemporalState } from '@/domain/events'
import {
  formatEventTime,
  formatMatchup,
  groupEventsByDay,
  type ProfileEvent
} from '@/domain/pub-profile'

type Props = {
  events: ProfileEvent[]
  /** O jogo já mostrado no topo — não se repete na agenda. */
  highlightedEventId: string | null
  whatsappUrl: string | null
  onWhatsApp: () => void
}

function EmptyAgenda({
  whatsappUrl,
  onWhatsApp
}: {
  whatsappUrl: string | null
  onWhatsApp: () => void
}) {
  return (
    <div className="border-[1.5px] border-[var(--onside-line)] border-dashed p-6 text-center">
      <p className="font-semibold text-[var(--onside-ink)] text-sm">
        Esse bar ainda não cadastrou jogos
      </p>
      <p className="mx-auto mt-1 max-w-[42ch] text-[var(--onside-muted)] text-sm">
        A programação pode existir sem estar no Onside. Pergunte direto ao bar o
        que vai passar.
      </p>
      {whatsappUrl && (
        <a
          href={whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onWhatsApp}
          className="onside-btn onside-btn-ink mt-4 min-h-12 justify-center px-5 text-sm"
        >
          <Chat size={16} color="currentColor" aria-hidden="true" />
          <span className="ml-2">Perguntar no WhatsApp</span>
        </a>
      )}
    </div>
  )
}

/**
 * A agenda do bar, agrupada por dia.
 *
 * Antes a seção sumia inteira quando não havia jogo (`if (!events.length)
 * return null`) — o buraco que deixava a página parecendo inacabada. Agora a
 * ausência de agenda também é uma resposta, e leva a uma conversa.
 */
export function EventsList({
  events,
  highlightedEventId,
  whatsappUrl,
  onWhatsApp
}: Props) {
  const now = useMinuteNow()
  const rest = events.filter((event) => event.id !== highlightedEventId)
  const groups = groupEventsByDay(rest, new Date(now))

  return (
    <section className="onside-panel p-5 md:p-6">
      <h2 className="onside-display mb-4 text-2xl">
        {highlightedEventId ? 'Também vai passar' : 'Programação'}
      </h2>

      {groups.length === 0 ? (
        <EmptyAgenda whatsappUrl={whatsappUrl} onWhatsApp={onWhatsApp} />
      ) : (
        <div className="space-y-5">
          {groups.map((group) => (
            <div key={group.key}>
              <p className="onside-kicker mb-2">{group.label}</p>
              <ul className="space-y-2">
                {group.events.map((event) => {
                  const live =
                    getEventTemporalState(event.startsAt, now) === 'live'

                  return (
                    <li key={event.id} className="onside-event-row">
                      <span className="font-[family-name:var(--onside-mono)] text-sm font-bold tabular-nums">
                        {formatEventTime(event.startsAt)}
                      </span>

                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-[var(--onside-ink)] text-sm">
                          {formatMatchup(event)}
                        </span>
                        <span className="block truncate font-[family-name:var(--onside-mono)] text-[10px] uppercase tracking-[0.12em] text-[var(--onside-muted)]">
                          {event.sport.name} · {event.championship}
                        </span>
                      </span>

                      {live && (
                        <span className="onside-badge onside-badge-live justify-self-start sm:justify-self-end">
                          <span
                            className="onside-live-dot"
                            aria-hidden="true"
                          />
                          Ao vivo
                        </span>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
