import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { brasiliaDay, brasiliaTime, dayLabel } from '@/components/painel/noite'
import { AppChegando } from '@/components/torcedor/app-chegando'
import { CartaoContaNova } from '@/components/torcedor/conta-nova'
import { Ic } from '@/components/torcedor/icones'
import { TorcedorShell, useTorcedor } from '@/components/torcedor/shell'
import { baixarAgenda } from '@/domain/agenda'
import {
  formatCode,
  getOffAirNotice,
  type MyGame,
  pastLabel
} from '@/domain/my-games'
import { getGameTitle } from '@/domain/reservation-validation'
import { useSession } from '@/hooks/use-session'
import { PWA_LINKS, PWA_META } from '@/lib/pwa'
import { getUserFacingMessage, isRetryableError } from '@/lib/user-facing-error'
import { useTRPC } from '@/utils/trpc'

type Aba = 'prox' | 'ant'

export const Route = createFileRoute('/(dashboard)/dashboard_/games')({
  head: () => ({
    meta: [
      { title: 'Meus jogos — Onside' },
      { name: 'robots', content: 'noindex' },
      ...PWA_META
    ],
    links: [...PWA_LINKS]
  }),
  // `?aba=ant` abre nos anteriores.
  validateSearch: (search: Record<string, unknown>): { aba?: Aba } =>
    search.aba === 'ant' ? { aba: 'ant' as const } : {},
  component: MeusJogos
})

/**
 * "Meus jogos" do web do torcedor (WEB-501, protótipo `#meus-jogos`): os
 * jogos marcados em "Vou assistir aqui", em ingressos, com o código do balcão
 * nos bares Elite e o "Estou aqui" nos outros. Os anteriores levam ao
 * pós-jogo, "Como foi?" (`/dashboard/avaliar/$eventId`).
 */
function MeusJogos() {
  return (
    <TorcedorShell aba="meus-jogos">
      <Conteudo />
    </TorcedorShell>
  )
}

function Conteudo() {
  const trpc = useTRPC()
  const session = useSession()
  const search = Route.useSearch()
  const aba: Aba = search.aba ?? 'prox'
  const query = useQuery({
    ...trpc.attendance.mine.queryOptions(),
    meta: { errorToast: false }
  })
  // Jogo com pergunta do pós-jogo aberta ganha o "Avaliar" ("Como foi?").
  const posJogo = useQuery({
    ...trpc.postGame.pending.queryOptions(),
    meta: { errorToast: false }
  })
  const cidade = useQuery({
    ...trpc.pubs.getMyCity.queryOptions(),
    meta: { errorToast: false }
  })
  const toRate = new Set((posJogo.data ?? []).map((item) => item.eventId))
  const games = query.data ?? []
  // O servidor manda do mais recente para o mais antigo; as próximas vão do
  // mais perto ao mais longe.
  const upcoming = games.filter((game) => !game.ended).reverse()
  const past = games.filter((game) => game.ended)
  const pendente = past.find((game) => toRate.has(game.eventId))

  return (
    <div className="page">
      <div className="k">
        {session?.user.name}
        {cidade.data ? ` · ${cidade.data.name}` : ''}
      </div>
      <h1 className="disp">Meus jogos</h1>
      <p className="sub">
        Os jogos que você marcou, com o código do balcão. Depois do jogo, conte
        como foi.
      </p>
      <CartaoContaNova />
      <div className="tabsx" role="tablist" aria-label="Jogos">
        {(
          [
            ['prox', 'Próximos', upcoming.length],
            ['ant', 'Anteriores', past.length]
          ] as const
        ).map(([id, rotulo, n]) => (
          <Link
            key={id}
            to="/dashboard/games"
            search={id === 'ant' ? { aba: 'ant' } : {}}
            replace
            role="tab"
            aria-selected={aba === id}
            className={aba === id ? 'on' : undefined}
          >
            {rotulo}
            <span className="n">{n}</span>
          </Link>
        ))}
      </div>

      {query.isError ? (
        <div className="empty" role="alert" style={{ marginTop: 18 }}>
          <b>Não carregou</b>
          <p>
            {getUserFacingMessage(
              query.error,
              'Não foi possível carregar seus jogos. Tente novamente.'
            )}
          </p>
          {isRetryableError(query.error) ? (
            <button
              type="button"
              className="btn b-ink sm"
              onClick={() => void query.refetch()}
            >
              Tentar de novo
            </button>
          ) : null}
        </div>
      ) : query.isPending ? (
        <div
          className="empty"
          role="status"
          aria-busy="true"
          style={{ marginTop: 18 }}
        >
          <b>Carregando seus jogos</b>
        </div>
      ) : aba === 'prox' ? (
        <>
          {pendente ? (
            <div className="notice">
              <Ic n="star" s={24} />
              <span>
                <b>
                  Como foi {getGameTitle(pendente)} no {pendente.barName}?
                </b>
                <span>Leva 20 segundos. Conte se você foi e se voltaria.</span>
              </span>
              <Link
                className="btn b-acid sm"
                to="/dashboard/avaliar/$eventId"
                params={{ eventId: pendente.eventId }}
              >
                Avaliar
              </Link>
            </div>
          ) : null}
          {upcoming.length ? (
            upcoming.map((game) => <Ingresso key={game.eventId} game={game} />)
          ) : (
            <div className="empty" style={{ marginTop: 18 }}>
              <b>Nenhum jogo marcado</b>
              <p>Escolha um jogo e toque em “Vou assistir aqui” no bar.</p>
              <Link className="btn b-ink sm" to="/dashboard">
                Ver jogos de hoje
              </Link>
            </div>
          )}
        </>
      ) : (
        <>
          {past.length ? (
            <ul className="pastl">
              {past.map((game) => (
                <li key={game.eventId} className="past">
                  <span className="h">
                    {brasiliaTime(game.startsAt)}
                    <small>{dayLabel(brasiliaDay(game.startsAt))}</small>
                  </span>
                  <span>
                    <b>{getGameTitle(game)}</b>
                    <p>
                      {game.barName} · {game.championship}
                    </p>
                  </span>
                  {toRate.has(game.eventId) ? (
                    <Link
                      className="btn b-acid sm"
                      to="/dashboard/avaliar/$eventId"
                      params={{ eventId: game.eventId }}
                      aria-label={`Avaliar o ${game.barName}`}
                    >
                      <Ic n="star" s={18} />
                      Avaliar
                    </Link>
                  ) : (
                    <span className={`vchip${game.validated ? '' : ' n'}`}>
                      {game.validated ? <Ic n="check" s={14} /> : null}
                      {game.validated ? 'Visita verificada' : pastLabel(game)}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <div className="empty" style={{ marginTop: 18 }}>
              <b>Nenhum jogo ainda</b>
              <p>Os jogos que você marcou aparecem aqui depois que acabam.</p>
            </div>
          )}
          <p className="pastnote">Jogo desmarcado não fica no histórico.</p>
        </>
      )}
      <AppChegando />
    </div>
  )
}

function Ingresso({ game }: { game: MyGame }) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const { avisar } = useTorcedor()
  const [erro, setErro] = useState<string | null>(null)
  const titulo = getGameTitle(game)
  const offAir = getOffAirNotice(game)
  const comecou = new Date(game.startsAt).getTime() <= Date.now()
  const hoje = brasiliaDay(game.startsAt) === brasiliaDay(new Date())
  const [a, b] = titulo.split(' × ')

  const desmarcar = useMutation(
    trpc.attendance.set.mutationOptions({
      onSuccess: () => {
        avisar('Desmarcado. O bar não conta mais você.')
        return queryClient.invalidateQueries()
      },
      onError: (e) =>
        setErro(
          getUserFacingMessage(
            e,
            'Não foi possível desmarcar. Tente novamente.'
          )
        )
    })
  )
  const checkIn = useMutation(
    trpc.attendance.checkIn.mutationOptions({
      onSuccess: () => avisar('Check-in feito: a visita conta.'),
      onError: (e) =>
        setErro(getUserFacingMessage(e, 'Não deu para fazer o check-in.'))
    })
  )
  const estouAqui = () => {
    setErro(null)
    navigator.geolocation?.getCurrentPosition(
      (p) =>
        checkIn.mutate({
          eventId: game.eventId,
          latitude: p.coords.latitude,
          longitude: p.coords.longitude
        }),
      () => setErro('O check-in precisa da sua localização.'),
      { enableHighAccuracy: true, timeout: 10_000 }
    )
  }

  return (
    <article className="tk" aria-label={game.barName}>
      <span className="ph">
        {game.photoUrl ? (
          <img src={game.photoUrl} alt="" width={480} height={360} />
        ) : (
          <span className="ph-vazio">
            <Ic n="beer" s={40} />
          </span>
        )}
      </span>
      <div className="bd">
        <span className="when2">
          {hoje ? 'HOJE' : dayLabel(brasiliaDay(game.startsAt)).toUpperCase()} ·{' '}
          {brasiliaTime(game.startsAt)} · {game.championship.toUpperCase()}
        </span>
        <h3>
          {b === undefined ? (
            titulo
          ) : (
            <>
              {a} <span className="hl">×</span> {b}
            </>
          )}
        </h3>
        <span className="at">
          <Ic n="pin" s={16} />{' '}
          {offAir ? (
            game.barName
          ) : (
            <Link to="/pub/$pubId" params={{ pubId: game.barId }}>
              {game.barName}
            </Link>
          )}{' '}
          · {game.neighborhood}
        </span>
        {offAir ? <p className="tk-aviso">{offAir}</p> : null}
        {erro ? (
          <p className="tk-aviso" role="alert">
            {erro}
          </p>
        ) : null}
        <div className="cta-row">
          <button
            className="btn b-ghost sm"
            type="button"
            onClick={() =>
              baixarAgenda({
                titulo,
                bar: game.barName,
                lugar: game.neighborhood,
                inicio: game.startsAt
              })
            }
          >
            <Ic n="calendar" s={18} />
            Pôr na agenda
          </button>
          {/* O servidor recusa desmarcar jogo começado ou código validado. */}
          {!comecou && !game.validated ? (
            <button
              className="btn b-ghost sm"
              type="button"
              disabled={desmarcar.isPending}
              onClick={() => {
                setErro(null)
                desmarcar.mutate({ eventId: game.eventId, attending: false })
              }}
            >
              {desmarcar.isPending ? 'Desmarcando…' : 'Desmarcar'}
            </button>
          ) : null}
        </div>
      </div>
      <div className="side">
        {game.code ? (
          <>
            <div className="code">
              <small>
                {game.validated
                  ? 'CÓDIGO VALIDADO'
                  : game.confirmsCodesLater
                    ? 'PARA A COMANDA'
                    : 'CÓDIGO DO BALCÃO'}
              </small>
              {formatCode(game.code)}
            </div>
            <Link
              className="btn b-acid sm"
              to="/dashboard/codigo/$eventId"
              params={{ eventId: game.eventId }}
            >
              <Ic n="qr" s={18} />
              Mostrar no balcão
            </Link>
          </>
        ) : (
          <>
            <div className="code code-txt">
              <small>NO BAR</small>
              Faça check-in quando chegar
            </div>
            <button
              className="btn b-ink sm"
              type="button"
              disabled={checkIn.isPending}
              onClick={estouAqui}
            >
              <Ic n="pin" s={18} />
              {checkIn.isPending ? 'Conferindo…' : 'Estou aqui'}
            </button>
          </>
        )}
      </div>
    </article>
  )
}
