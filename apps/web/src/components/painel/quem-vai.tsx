import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useMyBar } from '@/components/admin/admin-queries'
import { useMinuteNow } from '@/components/app/minute-tick'
import { Check, Qr, Search } from '@/components/landing/v3/icons'
import { getGameTitle } from '@/domain/reservation-validation'
import { isRetryableError } from '@/lib/user-facing-error'
import { useTRPC, useTRPCClient } from '@/utils/trpc'
import { Comanda } from './comanda'
import {
  AVATAR_COLORS,
  type GoingGame,
  goingCount,
  useGoing,
  useHashScroll
} from './dados'
import { brasiliaDay, brasiliaTime, relativeDayLabel } from './noite'
import { initials, usePainel } from './painel-shell'

/*
 * Quem vai (WEB-501, fase 3; protótipo `quemvai`): um cartão por jogo com a
 * validação aberta, quem validou, quem está a caminho e quem chegou depois do
 * início, com filtro e busca pelo nome. O bar Elite que confirma pela comanda
 * lança os códigos aqui (WEB-412). Sem Elite, a seção só existe por código em
 * aberto (WEB-341): honra quem já marcou.
 */

type Filtro = 'todos' | 'val' | 'cam'
type Person = GoingGame['people'][number]

/** "marcou há 2 h", "marcou há 40 min", "marcou há 3 dias". */
export function markedAgo(at: Date | string, now: number): string {
  const minutes = Math.max(
    1,
    Math.round((now - new Date(at).getTime()) / 60_000)
  )
  if (minutes < 60) return `marcou há ${minutes} min`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `marcou há ${hours} h`
  const days = Math.round(hours / 24)
  return `marcou há ${days} ${days === 1 ? 'dia' : 'dias'}`
}

/** Quem validou depois da hora do jogo chegou atrasado. */
export function arrivedLate(person: Person, startsAt: Date | string): boolean {
  return (
    !!person.validatedAt &&
    new Date(person.validatedAt).getTime() > new Date(startsAt).getTime()
  )
}

export function QuemVaiPage() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const { elite, openValidation } = usePainel()
  const now = useMinuteNow()
  const today = brasiliaDay(now)
  const going = useGoing()
  const { data: bar } = useMyBar()
  const confirmsLater = elite && bar?.confirmsCodesLater === true
  const notLogged = useQuery({
    ...trpc.reservationValidation.notLogged.queryOptions(),
    enabled: confirmsLater,
    meta: { errorToast: false }
  })
  // Cliente direto: repetir o lançamento é decisão do dono, nunca automática.
  const { reservationValidation } = useTRPCClient()
  useHashScroll(going.isSuccess)
  const offer = elite ? (bar?.houseOffer ?? null) : null

  return (
    <>
      <header className="pn-head">
        <div>
          <h1 className="pn-disp">Quem vai</h1>
          <p className="pn-sub">
            Quem marcou “Vou assistir aqui” recebe um código. A oferta da casa
            sai quando você valida.
          </p>
        </div>
        <div className="pn-acts">
          <button
            type="button"
            className="pn-btn pn-acid pn-sm"
            onClick={openValidation}
          >
            <Qr size={18} />
            Validar código
          </button>
        </div>
      </header>

      {elite ? null : (
        <div className="pn-avisos">
          <p className="pn-aviso" role="note">
            A lista de quem vai é um recurso do plano Elite. Os códigos abaixo
            continuam valendo: valide o de quem chegar.
          </p>
        </div>
      )}

      {confirmsLater ? (
        <Comanda
          logLate={reservationValidation.logLate.mutate}
          missing={notLogged.data}
          today={today}
          onLogged={() => {
            void notLogged.refetch()
            void queryClient.invalidateQueries({
              queryKey: trpc.barReservations.going.queryKey()
            })
          }}
        />
      ) : null}

      {going.isLoading ? (
        <div className="pn-skel pn-qv" role="status" aria-busy="true">
          <span className="sr-only">Carregando quem vai…</span>
          <i />
          <i />
        </div>
      ) : going.isError || !going.data ? (
        <div className="pn-avisos">
          <div className="pn-aviso is-error" role="alert">
            <div className="pn-aviso-t">
              <b>Não foi possível carregar quem vai.</b>
            </div>
            {isRetryableError(going.error) ? (
              <button
                type="button"
                className="pn-btn pn-ghost pn-sm"
                onClick={() => void going.refetch()}
              >
                Tentar novamente
              </button>
            ) : null}
          </div>
        </div>
      ) : going.data.length ? (
        going.data.map((game) => (
          <Jogo
            key={game.id}
            game={game}
            now={now}
            today={today}
            offer={offer}
          />
        ))
      ) : (
        <div className="pn-card pn-empty pn-qv">
          <p className="pn-disp">Ninguém marcou ainda.</p>
          <p>
            Quem tocar em “Vou assistir aqui” no seu perfil aparece aqui, jogo a
            jogo, com o código para validar.
          </p>
        </div>
      )}
    </>
  )
}

function Jogo({
  game,
  now,
  today,
  offer
}: {
  game: GoingGame
  now: number
  today: string
  offer: string | null
}) {
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [query, setQuery] = useState('')
  const { going, arrived } = goingCount(game)
  const title = getGameTitle(game)
  const started = new Date(game.startsAt).getTime() <= now
  const titleId = `qv-${game.id}`
  const q = query.trim().toLocaleLowerCase('pt-BR')
  const people = game.people.filter(
    (person) =>
      (filtro === 'todos' ||
        (filtro === 'val' ? !!person.validatedAt : !person.validatedAt)) &&
      (!q || person.name.toLocaleLowerCase('pt-BR').includes(q))
  )
  const meta = [
    relativeDayLabel(brasiliaDay(game.startsAt), today),
    title === game.championship ? null : game.championship,
    offer ? `oferta: ${offer}` : null
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <article
      id={`jogo-${game.id}`}
      className="pn-card pn-qv"
      aria-labelledby={titleId}
    >
      <div className="pn-qgh">
        <span className="pn-qh">{brasiliaTime(game.startsAt)}</span>
        <span>
          <b id={titleId}>{title}</b>
          <span>{meta}</span>
        </span>
        <span className="pn-qcnt">
          {going ? (
            <>
              <b>
                {arrived} / {going}
              </b>
              <span>{arrived === 1 ? 'validou' : 'validaram'}</span>
            </>
          ) : (
            <>
              <b>0</b>
              <span>marcaram</span>
            </>
          )}
        </span>
      </div>

      {going ? (
        <>
          <div className="pn-bar pn-qbar" aria-hidden="true">
            <i style={{ width: `${Math.round((arrived / going) * 100)}%` }} />
          </div>
          <div className="pn-qtools">
            <fieldset className="pn-tabs" aria-label="Mostrar">
              {(
                [
                  ['todos', 'Todos', going],
                  ['val', 'Validaram', arrived],
                  [
                    'cam',
                    started ? 'Não chegaram' : 'A caminho',
                    going - arrived
                  ]
                ] as const
              ).map(([id, label, count]) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={filtro === id}
                  onClick={() => setFiltro(id)}
                >
                  {label}
                  <span className="pn-n">{count}</span>
                </button>
              ))}
            </fieldset>
            <label className="pn-q">
              <Search size={18} />
              <span className="sr-only">Buscar pelo nome</span>
              <input
                type="text"
                inputMode="search"
                placeholder="Buscar pelo nome"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
          </div>
          {people.length ? (
            <ul className="pn-people">
              {people.map((person, index) => (
                <Pessoa
                  key={`${person.name}-${String(person.markedAt)}`}
                  person={person}
                  color={AVATAR_COLORS[(index % 5) + 1] ?? '#f6b8a6'}
                  startsAt={game.startsAt}
                  started={started}
                  now={now}
                />
              ))}
            </ul>
          ) : (
            <p className="pn-empty2">
              {q
                ? 'Ninguém com esse nome neste jogo.'
                : filtro === 'val'
                  ? 'Ninguém validou ainda.'
                  : 'Todos já validaram.'}
            </p>
          )}
        </>
      ) : (
        <p className="pn-empty2">
          Ninguém marcou ainda. Quando alguém marcar, aparece aqui com o código
          para validar.
        </p>
      )}
    </article>
  )
}

function Pessoa({
  person,
  color,
  startsAt,
  started,
  now
}: {
  person: Person
  color: string
  startsAt: Date | string
  started: boolean
  now: number
}) {
  const validated = !!person.validatedAt
  return (
    <li className="pn-pp">
      <span
        className="pn-pa"
        style={{ background: validated ? 'var(--acid)' : color }}
        aria-hidden="true"
      >
        {initials(person.name)}
      </span>
      <span className="pn-pp-m">
        <b>{person.name}</b>
        <span>
          {person.validatedAt
            ? `chegou ${brasiliaTime(person.validatedAt)}${arrivedLate(person, startsAt) ? ' · depois do início' : ''}`
            : markedAgo(person.markedAt, now)}
        </span>
      </span>
      {validated ? (
        <span className="pn-ok">
          <Check size={14} />
          Validou
        </span>
      ) : (
        <span className="pn-badge">{started ? 'NÃO CHEGOU' : 'A CAMINHO'}</span>
      )}
    </li>
  )
}
