import { gameTitle } from '@findsports_oficial/db/game-title'
import type { AdminEvent } from '@/components/admin/admin-model'
import { getEventTemporalState } from '@/domain/events'
import {
  agruparPorDia,
  type DiaSemana,
  type FiltroJogos,
  filtrarJogos
} from '@/domain/painel-jogos'
import { formatEventTime } from '@/domain/pub-profile'
import { Badge, Icone } from '../painel'
import { SeloJogo } from './jogo-aberto'

/**
 * A lista por dia (`listRows`): horário em Anton, jogo, uma linha de apoio e
 * a situação. A linha é um botão que abre o jogo à direita.
 */
export function ListaJogos({
  eventos,
  filtro,
  aberto,
  apoio,
  onAbrir
}: {
  eventos: AdminEvent[]
  filtro: FiltroJogos
  aberto: string | null
  /** "Brasileirão · 24 vão assistir" — quem monta é a página. */
  apoio: (evento: AdminEvent) => string
  onAbrir: (id: string) => void
}) {
  const now = Date.now()
  return (
    <div className="jogos-lista">
      {agruparPorDia(filtrarJogos(eventos, filtro, now), now).map((grupo) => (
        <section key={grupo.dia} aria-labelledby={`dia-${grupo.dia}`}>
          <h2
            id={`dia-${grupo.dia}`}
            className="jogos-dia-rotulo"
            data-hoje={grupo.hoje || undefined}
            style={{ marginBottom: 8 }}
          >
            {grupo.rotulo}
          </h2>
          <ul className="jogos-dia">
            {grupo.jogos.map((evento) => {
              const estado = getEventTemporalState(
                evento.startsAt,
                evento.endsAt,
                now
              )
              return (
                <li key={evento.id}>
                  <button
                    type="button"
                    className="jogos-linha"
                    aria-current={evento.id === aberto || undefined}
                    data-live={estado === 'live' || undefined}
                    data-passado={estado === 'past' || undefined}
                    onClick={() => onAbrir(evento.id)}
                  >
                    <span className="jogos-hora">
                      {formatEventTime(new Date(evento.startsAt))}
                    </span>
                    <span className="jogos-linha-texto">
                      <b>{gameTitle(evento)}</b>
                      <span>{apoio(evento)}</span>
                    </span>
                    <SeloJogo
                      startsAt={evento.startsAt}
                      endsAt={evento.endsAt}
                    />
                    <Icone
                      nome="right"
                      tamanho={12}
                      acento="var(--painel-muted)"
                      className="painel-muted"
                    />
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}

/**
 * A semana (`weekCal`): sete colunas, hoje em destaque, o ao vivo escuro com
 * a sombra vermelha. Dia vazio que ainda não passou ganha "Adicionar".
 */
export function SemanaJogos({
  dias,
  onAbrir,
  onAdicionar
}: {
  dias: DiaSemana<AdminEvent>[]
  onAbrir: (id: string) => void
  /** Ausente quando a criação está fechada. */
  onAdicionar?: (dia: string) => void
}) {
  const now = Date.now()
  return (
    <div className="jogos-semana">
      {dias.map((dia) => (
        <section
          key={dia.dia}
          className="jogos-semana-dia"
          data-hoje={dia.hoje || undefined}
          aria-label={`${dia.semana} ${dia.numero}${dia.hoje ? ', hoje' : ''}`}
        >
          <h2 className="jogos-semana-cab">
            <span>{dia.numero}</span>
            <span>
              {dia.semana}
              {dia.hoje ? ' · hoje' : ''}
            </span>
          </h2>
          {dia.jogos.map((evento) => {
            const estado = getEventTemporalState(
              evento.startsAt,
              evento.endsAt,
              now
            )
            return (
              <button
                key={evento.id}
                type="button"
                className="jogos-semana-jogo"
                data-live={estado === 'live' || undefined}
                data-passado={estado === 'past' || undefined}
                onClick={() => onAbrir(evento.id)}
              >
                <span>{formatEventTime(new Date(evento.startsAt))}</span>
                <b>{gameTitle(evento)}</b>
                {estado === 'live' ? <Badge tipo="live">Ao vivo</Badge> : null}
              </button>
            )
          })}
          {onAdicionar && !dia.passado && dia.jogos.length === 0 ? (
            <button
              type="button"
              className="jogos-semana-add"
              onClick={() => onAdicionar(dia.dia)}
            >
              <Icone nome="plus" tamanho={14} acento="currentColor" base={1} />
              Adicionar
            </button>
          ) : null}
        </section>
      ))}
    </div>
  )
}
