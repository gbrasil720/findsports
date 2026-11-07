import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import {
  brasiliaDay,
  brasiliaTime,
  shiftDay,
  weekdayShort
} from '@/components/painel/noite'
import { Ic } from '@/components/torcedor/icones'
import { TorcedorShell } from '@/components/torcedor/shell'
import { getGameTitle } from '@/domain/reservation-validation'
import { visitasDoAno } from '@/domain/seus-bares'
import { getUserFacingMessage } from '@/lib/user-facing-error'
import { useTRPC } from '@/utils/trpc'

type Aba = 'semana' | 'salvos' | 'fui'

export const Route = createFileRoute('/(dashboard)/dashboard_/seus-bares')({
  head: () => ({
    meta: [
      { title: 'Seus bares — Onside' },
      { name: 'robots', content: 'noindex' }
    ]
  }),
  validateSearch: (search: Record<string, unknown>): { aba?: Aba } =>
    search.aba === 'salvos' || search.aba === 'fui' ? { aba: search.aba } : {},
  component: SeusBares
})

/**
 * "Seus bares" do web (WEB-501, protótipo `#seus-bares`): a semana de jogos
 * dos bares salvos, os salvos e onde a pessoa já foi (as visitas: código
 * validado ou check-in, `attendance.visits`).
 */
function SeusBares() {
  return (
    <TorcedorShell aba="seus-bares">
      <Conteudo />
    </TorcedorShell>
  )
}

type Jogo = {
  id: string
  startsAt: string | Date
  championship: string
  participantFreeText: string | null
  participants: { team: { name: string } }[]
}

const tituloDe = (jogo: Jogo) =>
  getGameTitle({
    championship: jogo.championship,
    participantFreeText: jogo.participantFreeText,
    participants: jogo.participants.map((p) => p.team.name)
  })

function Conteudo() {
  const trpc = useTRPC()
  const aba: Aba = Route.useSearch().aba ?? 'semana'
  const favoritos = useQuery({
    ...trpc.pubs.getFavorites.queryOptions(),
    meta: { errorToast: false }
  })
  const visitas = useQuery({
    ...trpc.attendance.visits.queryOptions(),
    meta: { errorToast: false }
  })
  const salvos = favoritos.data ?? []
  const fui = visitas.data ?? []
  const ano = new Date().getFullYear()
  const doAno = visitasDoAno(fui, ano)
  const hoje = brasiliaDay(new Date())
  const semana = Array.from({ length: 7 }, (_, i) => shiftDay(hoje, i))

  const erro = favoritos.isError || visitas.isError

  return (
    <div className="page">
      <div className="k">
        {salvos.length} {salvos.length === 1 ? 'bar salvo' : 'bares salvos'} ·{' '}
        {doAno.jogos} {doAno.jogos === 1 ? 'visita' : 'visitas'} em {ano}
      </div>
      <h1 className="disp">Seus bares</h1>
      <p className="sub">
        A semana de jogos dos bares que você salvou, e onde você já foi.
      </p>
      <div className="tabsx" role="tablist" aria-label="Seus bares">
        {(
          [
            ['semana', 'Esta semana'],
            ['salvos', 'Favoritos'],
            ['fui', 'Já fui']
          ] as const
        ).map(([id, rotulo]) => (
          <Link
            key={id}
            to="/dashboard/seus-bares"
            search={id === 'semana' ? {} : { aba: id }}
            replace
            role="tab"
            aria-selected={aba === id}
            className={aba === id ? 'on' : undefined}
          >
            {rotulo}
          </Link>
        ))}
      </div>

      {erro ? (
        <div className="empty" role="alert" style={{ marginTop: 18 }}>
          <b>Não carregou</b>
          <p>
            {getUserFacingMessage(
              favoritos.error ?? visitas.error,
              'Não deu para abrir seus bares agora.'
            )}
          </p>
          <button
            type="button"
            className="btn b-ink sm"
            onClick={() => {
              void favoritos.refetch()
              void visitas.refetch()
            }}
          >
            Tentar de novo
          </button>
        </div>
      ) : aba === 'semana' ? (
        salvos.length ? (
          <div className="wk">
            {semana.map((dia) => {
              const itens = salvos.flatMap((f) =>
                (f.bar.events as Jogo[])
                  .filter((jogo) => brasiliaDay(jogo.startsAt) === dia)
                  .map((jogo) => ({ bar: f.bar, jogo }))
              )
              const { weekday, date } = weekdayShort(dia)
              return (
                <div key={dia} className={`d${dia === hoje ? ' hj' : ''}`}>
                  <h4>
                    {dia === hoje ? 'hoje' : weekday}
                    <b>{date}</b>
                  </h4>
                  {itens.length ? (
                    itens.slice(0, 3).map(({ bar, jogo }) => (
                      <Link
                        key={jogo.id}
                        to="/pub/$pubId"
                        params={{ pubId: bar.id }}
                        search={{ eventId: jogo.id }}
                      >
                        <b>{brasiliaTime(jogo.startsAt)}</b>
                        {tituloDe(jogo)}
                        <br />
                        <span className="muted">{bar.name}</span>
                      </Link>
                    ))
                  ) : (
                    <p className="wk-vazio">Nenhum jogo nos seus bares.</p>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          <SemSalvos />
        )
      ) : aba === 'salvos' ? (
        salvos.length ? (
          <div className="saved">
            {salvos.map(({ bar }) => {
              const proximo = (bar.events as Jogo[])[0]
              return (
                <Link
                  key={bar.id}
                  className="sv"
                  to="/pub/$pubId"
                  params={{ pubId: bar.id }}
                >
                  {bar.photoUrl ? (
                    <img
                      src={bar.photoUrl}
                      alt=""
                      loading="lazy"
                      width={480}
                      height={360}
                    />
                  ) : (
                    <span className="sv-vazio">
                      <Ic n="beer" s={36} />
                    </span>
                  )}
                  <span className="in">
                    <b>{bar.name}</b>
                    <span>
                      {bar.neighborhood} · {bar.city}
                    </span>
                    {proximo ? (
                      <span className="nx">
                        <Ic n="tv" s={15} />
                        Próximo: {tituloDe(proximo)} ·{' '}
                        {brasiliaTime(proximo.startsAt)}
                      </span>
                    ) : null}
                  </span>
                </Link>
              )
            })}
          </div>
        ) : (
          <SemSalvos />
        )
      ) : (
        <>
          <div className="stats3">
            <div>
              <b>{doAno.jogos}</b>
              <span>jogos vistos em bar</span>
            </div>
            <div>
              <b>{doAno.bares}</b>
              <span>bares diferentes</span>
            </div>
            <div>
              <b>{doAno.bairros}</b>
              <span>bairros</span>
            </div>
          </div>
          <div
            className="vis"
            role="img"
            aria-label={`Visitas por mês em ${ano}`}
          >
            {doAno.meses.map(([mes, n]) => (
              <div key={mes}>
                <i>
                  <span
                    style={{
                      height: `${doAno.pico ? (n / doAno.pico) * 100 : 0}%`
                    }}
                  />
                </i>
                {mes}
              </div>
            ))}
          </div>
          {fui.length ? (
            <ul className="pastl">
              {fui.map((v) => {
                const { weekday, date } = weekdayShort(brasiliaDay(v.startsAt))
                return (
                  <li key={v.eventId} className="past">
                    <span className="h">
                      {date.split(' ')[0]}
                      <small>
                        {weekday} · {date.split(' ')[1]}
                      </small>
                    </span>
                    <span>
                      <b>{v.barName}</b>
                      <p>
                        {getGameTitle(v)} · {v.neighborhood}
                      </p>
                    </span>
                    <span className="vchip">
                      <Ic n="check" s={14} />
                      Visita verificada
                    </span>
                  </li>
                )
              })}
            </ul>
          ) : (
            <div className="empty" style={{ marginTop: 18 }}>
              <b>Nenhuma visita ainda</b>
              <p>
                Conta como visita o código validado no balcão ou o check-in
                “Estou aqui” no bar.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function SemSalvos() {
  return (
    <div className="empty" style={{ marginTop: 18 }}>
      <b>Nenhum bar salvo</b>
      <p>Toque no coração de um bar para ver a semana de jogos dele aqui.</p>
      <Link className="btn b-ink sm" to="/dashboard">
        Ver bares com jogo
      </Link>
    </div>
  )
}
