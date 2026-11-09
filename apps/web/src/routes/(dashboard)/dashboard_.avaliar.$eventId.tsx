import { RATING_REASONS } from '@findsports_oficial/api/lib/rating-reasons'
import { RATING_COMMENT_MAX } from '@findsports_oficial/db/rating-limits'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { brasiliaDay, brasiliaTime, dayLabel } from '@/components/painel/noite'
import { Ic, type IconName } from '@/components/torcedor/icones'
import { TorcedorShell } from '@/components/torcedor/shell'
import { getGameTitle } from '@/domain/reservation-validation'
import { getUserFacingMessage } from '@/lib/user-facing-error'
import { useTRPC } from '@/utils/trpc'

export const Route = createFileRoute(
  '/(dashboard)/dashboard_/avaliar/$eventId'
)({
  head: () => ({
    meta: [
      { title: 'Como foi? — Onside' },
      { name: 'robots', content: 'noindex' }
    ]
  }),
  component: Avaliar
})

type Reason = (typeof RATING_REASONS)[number]['id']

const ICONE: Record<Reason, IconName> = {
  sound: 'sound',
  screen: 'tv',
  service: 'people',
  price: 'ticket',
  crowded: 'fire',
  food: 'beer'
}

/**
 * "Como foi?" do web (WEB-501, protótipo `#avaliar-<bar>`): o pós-jogo da
 * fila `postGame.pending` numa tela só. "Você foi?" (quando a pergunta
 * existe), "Voltaria?", estrelas (obrigatórias aqui), "O que pesou?",
 * comentário (passa pela revisão da Onside) e "Mostrar meu nome". A faixa de
 * visita verificada só aparece quando a visita existe (código validado ou
 * check-in, `attendance.visits`).
 */
function Avaliar() {
  return (
    <TorcedorShell aba="meus-jogos">
      <Conteudo />
    </TorcedorShell>
  )
}

function Conteudo() {
  const { eventId } = Route.useParams()
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const fila = useQuery({
    ...trpc.postGame.pending.queryOptions(),
    meta: { errorToast: false }
  })
  const visitas = useQuery({
    ...trpc.attendance.visits.queryOptions(),
    meta: { errorToast: false }
  })
  const item = fila.data?.find((i) => i.eventId === eventId)
  const verificada = Boolean(visitas.data?.some((v) => v.eventId === eventId))

  const [foi, setFoi] = useState<boolean | null>(null)
  const [volta, setVolta] = useState<boolean | null>(null)
  const [estrelas, setEstrelas] = useState(0)
  const [pesou, setPesou] = useState<Reason[]>([])
  const [texto, setTexto] = useState('')
  const [nome, setNome] = useState(false)
  const [enviado, setEnviado] = useState<'fui' | 'nao' | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const enviar = useMutation(
    trpc.postGame.answer.mutationOptions({
      onSuccess: (_d, input) => {
        setEnviado(input.attended === false ? 'nao' : 'fui')
        window.scrollTo(0, 0)
      },
      onError: (e) =>
        setErro(getUserFacingMessage(e, 'Não deu para enviar. Tente de novo.'))
    })
  )
  const desfazer = useMutation(
    trpc.postGame.undo.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries()
        setEnviado(null)
      },
      onError: (e) => setErro(getUserFacingMessage(e, 'Não deu para desfazer.'))
    })
  )

  if (fila.isPending) {
    return (
      <div className="page rvw" role="status" aria-busy="true">
        <p className="sub">Carregando…</p>
      </div>
    )
  }
  if (enviado) {
    return (
      <div className="page rvw">
        <div className="done2">
          <span className="big">
            <Ic n="check" s={48} />
          </span>
          <h1 className="disp" style={{ marginTop: 22 }}>
            {enviado === 'nao' ? 'Tudo certo' : 'Valeu pela resenha'}
          </h1>
          <p className="sub" style={{ margin: '12px auto 0' }}>
            {enviado === 'nao'
              ? 'O jogo não conta como visita.'
              : verificada
                ? `Sua nota já conta para o ${item?.barName ?? 'bar'}. O comentário aparece depois da revisão da Onside.`
                : 'Avaliação gravada. Ela entra na nota do bar quando a visita é verificada: código validado no balcão ou check-in no bar.'}
          </p>
          {erro ? (
            <p className="tk-aviso" role="alert">
              {erro}
            </p>
          ) : null}
          <div
            className="cta-row"
            style={{ justifyContent: 'center', marginTop: 24 }}
          >
            <Link className="btn b-ink sm" to="/dashboard/games">
              Meus jogos
            </Link>
            <button
              className="btn b-ghost sm"
              type="button"
              disabled={desfazer.isPending}
              onClick={() =>
                desfazer.mutate({
                  eventId,
                  presence: Boolean(item?.presence),
                  rating: enviado === 'fui' && Boolean(item?.rating)
                })
              }
            >
              Desfazer
            </button>
          </div>
        </div>
      </div>
    )
  }
  if (!item) {
    return (
      <div className="page rvw">
        <Link className="btn b-ghost sm" to="/dashboard/games">
          <Ic n="back" s={18} />
          Meus jogos
        </Link>
        <div className="empty" style={{ marginTop: 18 }}>
          <b>Nada para avaliar</b>
          <p>
            Este jogo já foi avaliado, ou a avaliação fechou (ela vale até 14
            dias depois do jogo).
          </p>
        </div>
      </div>
    )
  }

  // Sem a pergunta "Você foi?" (já respondida), a pessoa foi.
  const perguntaFoi = item.presence !== null
  const foiMesmo = perguntaFoi ? foi : true
  const titulo = getGameTitle(item)
  const quando = `${dayLabel(brasiliaDay(item.startsAt))}, ${brasiliaTime(item.startsAt)}`
  const podeEnviar =
    foiMesmo === false ||
    (foiMesmo === true && (!item.rating || (volta !== null && estrelas > 0)))

  const mandar = () => {
    setErro(null)
    if (foiMesmo === false) {
      enviar.mutate({ eventId, attended: false })
      return
    }
    enviar.mutate({
      eventId,
      ...(perguntaFoi ? { attended: true } : {}),
      ...(item.rating && volta !== null
        ? {
            rating: {
              wouldReturn: volta,
              reasons: pesou,
              stars: estrelas,
              comment: texto,
              identified: nome
            }
          }
        : {})
    })
  }

  return (
    <div className="page rvw">
      <Link className="btn b-ghost sm" to="/dashboard/games">
        <Ic n="back" s={18} />
        Meus jogos
      </Link>
      <h1 className="disp" style={{ marginTop: 18 }}>
        Como foi?
      </h1>
      <div className="head">
        {item.photoUrl ? <img src={item.photoUrl} alt="" /> : null}
        <span>
          <b>{item.barName}</b>
          <span>
            {titulo} · {quando}
          </span>
        </span>
      </div>

      {perguntaFoi ? (
        <fieldset className="q3">
          <legend>
            <h2>Você foi?</h2>
          </legend>
          <div className="yn">
            <button
              type="button"
              aria-pressed={foi === true}
              onClick={() => setFoi(true)}
            >
              <Ic n="check" s={20} />
              Fui
            </button>
            <button
              type="button"
              aria-pressed={foi === false}
              onClick={() => setFoi(false)}
            >
              Não fui
            </button>
          </div>
        </fieldset>
      ) : null}

      {foiMesmo === false ? (
        <p className="sub" style={{ marginTop: 22 }}>
          Tudo bem. O jogo não conta como visita.
        </p>
      ) : null}

      {foiMesmo === true && item.rating ? (
        <>
          <fieldset className="q3">
            <legend>
              <h2>Voltaria para ver um jogo lá?</h2>
            </legend>
            <div className="yn">
              <button
                type="button"
                aria-pressed={volta === true}
                onClick={() => setVolta(true)}
              >
                Voltaria
              </button>
              <button
                type="button"
                aria-pressed={volta === false}
                onClick={() => setVolta(false)}
              >
                Não voltaria
              </button>
            </div>
          </fieldset>
          <fieldset className="q3">
            <legend>
              <h2>Sua nota</h2>
            </legend>
            <div className="stars" role="radiogroup" aria-label="Nota de 1 a 5">
              {[1, 2, 3, 4, 5].map((n) => (
                // biome-ignore lint/a11y/useSemanticElements: o protótipo desenha a nota como cinco botões.
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={estrelas === n}
                  aria-label={`${n} ${n === 1 ? 'estrela' : 'estrelas'}`}
                  className={n <= estrelas ? 'on' : undefined}
                  onClick={() => setEstrelas(n)}
                >
                  <Ic n="star" s={26} />
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset className="q3">
            <legend>
              <h2>O que pesou?</h2>
            </legend>
            <p>Opcional. Toque em quantos quiser.</p>
            <div className="why2">
              {RATING_REASONS.map((r) => {
                const on = pesou.includes(r.id)
                return (
                  <button
                    key={r.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      setPesou((atual) =>
                        on ? atual.filter((x) => x !== r.id) : [...atual, r.id]
                      )
                    }
                  >
                    <Ic n={ICONE[r.id]} s={18} />
                    {r.label}
                  </button>
                )
              })}
            </div>
          </fieldset>
          <div className="q3">
            <h2>
              <label htmlFor="rv-t">Quer contar mais?</label>
            </h2>
            <p>Opcional. Aparece depois da revisão da Onside.</p>
            <textarea
              id="rv-t"
              placeholder="Som alto no segundo tempo, telão dava para ver de qualquer mesa…"
              maxLength={RATING_COMMENT_MAX}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
            />
            <div className="togrow">
              <span id="rv-nome">Mostrar meu nome no comentário</span>
              <button
                className="tg"
                type="button"
                role="switch"
                aria-checked={nome}
                aria-labelledby="rv-nome"
                onClick={() => setNome((n) => !n)}
              />
            </div>
          </div>
          {verificada ? (
            <div className="verif">
              <Ic n="check" s={20} />
              <span>
                <b>Visita verificada.</b> Você validou o código no balcão ou fez
                check-in, então sua nota entra na média do bar.
              </span>
            </div>
          ) : (
            <p className="rv-nota">
              Sem visita verificada (código validado no balcão ou check-in no
              bar), a avaliação fica gravada mas não entra na nota do bar.
            </p>
          )}
        </>
      ) : null}

      {erro ? (
        <p className="tk-aviso" role="alert" style={{ marginTop: 18 }}>
          {erro}
        </p>
      ) : null}
      <div className="sendrow">
        <button
          className={`btn ${foiMesmo === false ? 'b-ink' : 'b-acid'}`}
          type="button"
          disabled={!podeEnviar || enviar.isPending}
          onClick={mandar}
        >
          {enviar.isPending
            ? 'Enviando…'
            : foiMesmo === false
              ? 'Confirmar'
              : 'Enviar avaliação'}
        </button>
      </div>
    </div>
  )
}
