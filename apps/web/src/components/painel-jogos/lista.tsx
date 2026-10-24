import { brasiliaDay } from '@findsports_oficial/db/event-window'
import { gameTitle } from '@findsports_oficial/db/game-title'
import type { AdminEvent } from '@/components/admin/admin-model'
import { getEventTemporalState } from '@/domain/events'
import {
  agruparPorDia,
  type DiaSemana,
  ehRascunho,
  type FiltroJogos,
  filtrarJogos
} from '@/domain/painel-jogos'
import { formatEventTime } from '@/domain/pub-profile'
import { Badge, Botao, Icone } from '../painel'
import { SeloJogo } from './jogo-aberto'

/**
 * A lista por dia (`listRows`): horário em Anton, jogo, uma linha de apoio e
 * a situação. A linha é um botão que abre o jogo à direita; no rascunho, o
 * "Publicar" fica no lugar da seta (`gameRow`), ao lado do botão da linha.
 */
export function ListaJogos({
  eventos,
  filtro,
  aberto,
  apoio,
  onAbrir,
  onPublicar,
  publicando
}: {
  eventos: AdminEvent[]
  filtro: FiltroJogos
  aberto: string | null
  /** "Brasileirão · 24 vão assistir" — quem monta é a página. */
  apoio: (evento: AdminEvent) => string
  onAbrir: (id: string) => void
  onPublicar: (id: string) => void
  /** O rascunho que está indo ao ar agora. */
  publicando: string | null
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
              const rascunho = ehRascunho(evento)
              return (
                <li key={evento.id}>
                  <button
                    type="button"
                    className="jogos-linha"
                    aria-current={evento.id === aberto || undefined}
                    data-live={(!rascunho && estado === 'live') || undefined}
                    data-passado={estado === 'past' || undefined}
                    data-rascunho={rascunho || undefined}
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
                      publishedAt={evento.publishedAt}
                    />
                    {rascunho ? null : (
                      <Icone
                        nome="right"
                        tamanho={12}
                        acento="var(--painel-muted)"
                        className="painel-muted"
                      />
                    )}
                  </button>
                  {rascunho ? (
                    <Botao
                      altura={36}
                      className="jogos-linha-publicar"
                      onClick={() => onPublicar(evento.id)}
                      disabled={publicando !== null}
                      aria-label={`Publicar ${gameTitle(evento)}`}
                    >
                      {publicando === evento.id ? 'Publicando…' : 'Publicar'}
                    </Botao>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}

/** O jogo aberto no formulário, como a semana o mostra ("Editando", 1p). */
export type JogoEditando = {
  /** Ausente no jogo novo. */
  id?: string
  startsAt: string
  titulo: string
}

/**
 * A semana (`weekCal`): sete colunas, hoje em destaque, o ao vivo escuro com
 * a sombra vermelha, o rascunho tracejado e, com o formulário aberto, o jogo
 * que está sendo editado em acid. Dia vazio que ainda não passou ganha
 * "Adicionar".
 */
export function SemanaJogos({
  dias,
  onAbrir,
  onAdicionar,
  editando
}: {
  dias: DiaSemana<AdminEvent>[]
  onAbrir: (id: string) => void
  /** Ausente quando a criação está fechada. */
  onAdicionar?: (dia: string) => void
  editando?: JogoEditando | null
}) {
  const now = Date.now()
  const diaEditando =
    editando?.startsAt && !Number.isNaN(new Date(editando.startsAt).getTime())
      ? brasiliaDay(new Date(editando.startsAt))
      : null
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
          {[
            ...dia.jogos.filter((evento) => evento.id !== editando?.id),
            ...(editando && diaEditando === dia.dia ? [editando] : [])
          ]
            .sort(
              (a, b) =>
                new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()
            )
            .map((jogo) => {
              const hora = formatEventTime(new Date(jogo.startsAt))
              if (!('barId' in jogo)) {
                return (
                  <div
                    key="editando"
                    className="jogos-semana-jogo"
                    data-editando
                  >
                    <span>{hora}</span>
                    <b>{jogo.titulo}</b>
                    <span>Editando</span>
                  </div>
                )
              }
              const rascunho = ehRascunho(jogo)
              const estado = getEventTemporalState(
                jogo.startsAt,
                jogo.endsAt,
                now
              )
              return (
                <button
                  key={jogo.id}
                  type="button"
                  className="jogos-semana-jogo"
                  data-live={(!rascunho && estado === 'live') || undefined}
                  data-passado={estado === 'past' || undefined}
                  data-rascunho={rascunho || undefined}
                  onClick={() => onAbrir(jogo.id)}
                >
                  <span>{hora}</span>
                  <b>{gameTitle(jogo)}</b>
                  {rascunho ? (
                    <span>Rascunho</span>
                  ) : estado === 'live' ? (
                    <Badge tipo="live">Ao vivo</Badge>
                  ) : null}
                </button>
              )
            })}
          {onAdicionar &&
          !dia.passado &&
          dia.jogos.length === 0 &&
          diaEditando !== dia.dia ? (
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
