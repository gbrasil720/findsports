import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { brasiliaDay, brasiliaTime, dayLabel } from '@/components/painel/noite'
import { QRCode } from '@/components/qr-code'
import { Ic } from '@/components/torcedor/icones'
import { TorcedorShell } from '@/components/torcedor/shell'
import { baixarAgenda } from '@/domain/agenda'
import { formatCode } from '@/domain/my-games'
import { getGameTitle } from '@/domain/reservation-validation'
import { getUserFacingMessage } from '@/lib/user-facing-error'
import { useTRPC } from '@/utils/trpc'

export const Route = createFileRoute('/(dashboard)/dashboard_/codigo/$eventId')(
  {
    head: () => ({
      meta: [
        { title: 'Seu código — Onside' },
        { name: 'robots', content: 'noindex' }
      ]
    }),
    component: Codigo
  }
)

/**
 * O código no balcão (protótipo `#codigo-<n>`): o ingresso claro sobre a
 * tela escura, com o QR que abre a validação do bar, o código em dois blocos
 * e a oferta da casa deste jogo.
 */
function Codigo() {
  return (
    <TorcedorShell aba="meus-jogos">
      <Ticket />
    </TorcedorShell>
  )
}

function Ticket() {
  const { eventId } = Route.useParams()
  const trpc = useTRPC()
  const query = useQuery({
    ...trpc.attendance.mine.queryOptions(),
    meta: { errorToast: false }
  })
  const game = query.data?.find((item) => item.eventId === eventId)

  if (query.isPending) {
    return (
      <div className="codepage" role="status" aria-busy="true">
        <p className="note">Abrindo seu código…</p>
      </div>
    )
  }
  if (!game?.code) {
    return (
      <div className="codepage">
        <div>
          <p className="note" role={query.isError ? 'alert' : undefined}>
            {query.isError
              ? getUserFacingMessage(
                  query.error,
                  'Não deu para abrir o código.'
                )
              : 'Este jogo não tem código do balcão. Ele sai nos bares Elite, ao marcar “Vou assistir aqui”.'}
          </p>
          <div className="codeacts">
            <Link className="btn b-ghost sm" to="/dashboard/games">
              <Ic n="back" s={18} />
              Meus jogos
            </Link>
          </div>
        </div>
      </div>
    )
  }

  const titulo = getGameTitle(game)
  const hoje = brasiliaDay(game.startsAt) === brasiliaDay(new Date())
  const quando = `${hoje ? 'hoje' : dayLabel(brasiliaDay(game.startsAt))} ${brasiliaTime(game.startsAt)}`
  const valida = `${window.location.origin}/admin/validate?code=${game.code}`

  return (
    <div className="codepage">
      <div>
        <div className="ticket">
          <div className="top">
            <span>
              <b>{game.barName}</b>
              <span>
                {titulo} · {quando}
              </span>
            </span>
            <span className="lv">ELITE</span>
          </div>
          <div className="qrw">
            <div
              className="q2"
              role="img"
              aria-label={`QR do código ${game.code}`}
            >
              <QRCode value={valida} size={192} fgColor="#12120f" />
            </div>
          </div>
          <p className="big">
            <span className="sr">Código {game.code.split('').join(' ')}</span>
            <span aria-hidden="true">{formatCode(game.code)}</span>
          </p>
          <p className="hint">
            {game.validated
              ? 'Código validado no balcão. A visita conta.'
              : game.confirmsCodesLater
                ? 'Mostre ao garçom: ele anota o código na comanda. Vale para este jogo, neste bar.'
                : 'Mostre ao garçom ou no balcão. Vale para este jogo, neste bar.'}
          </p>
          <div className="cut" aria-hidden="true" />
          <div className="of">
            <span className="ib">
              <Ic n="beer" s={22} />
            </span>
            <span>
              <b>Oferta da casa</b>
              <span>{game.offer ?? 'Sem oferta neste jogo'}</span>
            </span>
          </div>
        </div>
        <div className="codeacts">
          <Link className="btn b-ghost sm" to="/dashboard/games">
            <Ic n="back" s={18} />
            Meus jogos
          </Link>
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
        </div>
        <p className="note">
          Aumente o brilho da tela. O código vale só no dia do jogo, no bar que
          você marcou.
        </p>
      </div>
    </div>
  )
}
