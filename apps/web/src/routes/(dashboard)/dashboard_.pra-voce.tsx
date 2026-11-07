import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { OnsideMap } from '@/components/app/onside-map'
import { Ic } from '@/components/torcedor/icones'
import { TorcedorShell, useTorcedor } from '@/components/torcedor/shell'
import { SAO_PAULO_CITY } from '@/domain/discovery'
import {
  distanceText,
  gameWhen,
  nextRoundLabel,
  type Suggestion,
  whyLines
} from '@/domain/pra-voce'
import { getGameTitle } from '@/domain/reservation-validation'
import { getUserFacingMessage, isRetryableError } from '@/lib/user-facing-error'
import { useTRPC } from '@/utils/trpc'

export const Route = createFileRoute('/(dashboard)/dashboard_/pra-voce')({
  head: () => ({
    meta: [
      { title: 'Bares pra você — Onside' },
      { name: 'robots', content: 'noindex' }
    ]
  }),
  component: PraVoce
})

/**
 * "Bares pra você" no web (WEB-501, protótipo `#pra-voce`): a rodada do dia
 * (`recommendations.today`, WEB-425) como escalação, os cinco lado a lado com
 * o mapa, decididos em qualquer ordem. O baralho fica no app.
 */
function PraVoce() {
  return (
    <TorcedorShell aba="pra-voce">
      <Conteudo />
    </TorcedorShell>
  )
}

function useOnde() {
  const [aparelho, setAparelho] = useState<{ lat: number; lng: number } | null>(
    null
  )
  const [lido, setLido] = useState(false)
  useEffect(() => {
    const fim = () => setLido(true)
    navigator.permissions
      ?.query({ name: 'geolocation' })
      .then((status) => {
        if (status.state !== 'granted') return fim()
        navigator.geolocation.getCurrentPosition(
          (p) => {
            setAparelho({ lat: p.coords.latitude, lng: p.coords.longitude })
            fim()
          },
          fim,
          { timeout: 8000, maximumAge: 5 * 60_000 }
        )
      })
      .catch(fim)
    if (!navigator.permissions) fim()
  }, [])
  return { aparelho, lido }
}

function Conteudo() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const { avisar } = useTorcedor()
  const { aparelho, lido } = useOnde()
  const cidade = useQuery({
    ...trpc.pubs.getMyCity.queryOptions(),
    meta: { errorToast: false }
  })
  const times = useQuery({
    ...trpc.pubs.getMyTeams.queryOptions(),
    meta: { errorToast: false }
  })
  const centro = aparelho ?? cidade.data ?? SAO_PAULO_CITY
  const hoje = useQuery({
    ...trpc.recommendations.today.queryOptions({
      where: { lat: centro.lat, lng: centro.lng }
    }),
    enabled: lido && !cidade.isPending,
    meta: { errorToast: false }
  })
  const [quente, setQuente] = useState<string | null>(null)
  const rodada = hoje.data?.round
  const raio = rodada?.radiusKm ?? hoje.data?.userRadiusKm ?? 3
  const itens = rodada?.items ?? []
  const decididos = itens.filter((item) => item.decision).length
  const salvos = itens.filter((item) => item.decision === 'liked').length
  const now = Date.now()

  const reler = () => queryClient.invalidateQueries()
  const erro = (e: unknown) =>
    avisar(getUserFacingMessage(e, 'Não deu para gravar. Tente de novo.'))
  const curtir = useMutation(
    trpc.recommendations.like.mutationOptions({
      onSuccess: reler,
      onError: erro
    })
  )
  const passar = useMutation(
    trpc.recommendations.dismiss.mutationOptions({
      onSuccess: reler,
      onError: erro
    })
  )
  const desfazer = useMutation(
    trpc.recommendations.undo.mutationOptions({
      onSuccess: reler,
      onError: erro
    })
  )
  const avisarAlerta = useMutation(
    trpc.recommendations.setAlert.mutationOptions({
      onSuccess: reler,
      onError: erro
    })
  )

  const fontes: [Parameters<typeof Ic>[0]['n'], string, string][] = [
    [
      'heart',
      'Seus times',
      times.data?.length
        ? times.data
            .slice(0, 2)
            .map((t) => t.name)
            .join(', ')
        : 'nenhum ainda'
    ],
    [
      'pin',
      'Seu raio',
      `${raio} km de ${aparelho ? 'você' : (cidade.data ?? SAO_PAULO_CITY).name}`
    ],
    ['sparkle', 'Novidade', 'bares onde você ainda não foi']
  ]

  return (
    <div className="page rd">
      <div className="rd-head">
        <div>
          <div className="k">
            Rodada de hoje
            {rodada
              ? ` · ${nextRoundLabel(rodada.nextRoundAt, now).replace('Nova rodada ', 'a próxima ')}`
              : ''}
          </div>
          <h1 className="disp">Bares pra você</h1>
          <p className="sub">
            Cinco bares por dia, escolhidos pelos seus times, pelo seu raio e
            por onde você já foi.
          </p>
        </div>
        {itens.length ? (
          <div
            className="rd-prog"
            role="img"
            aria-label={`${decididos} de ${itens.length} decididos`}
          >
            <span className="mono">
              {decididos}/{itens.length}
            </span>
            <span className="rd-bar">
              {itens.map((item) => (
                <i
                  key={item.barId}
                  className={
                    item.decision === 'liked'
                      ? 'save'
                      : item.decision === 'passed'
                        ? 'skip'
                        : undefined
                  }
                />
              ))}
            </span>
          </div>
        ) : null}
      </div>
      <div className="rd-src">
        {fontes.map(([icone, titulo, texto]) => (
          <span key={titulo}>
            <Ic n={icone} s={16} />
            <b>{titulo}</b>
            {texto}
          </span>
        ))}
        <Link to="/dashboard/preferencias">Ajustar</Link>
      </div>

      {hoje.isError ? (
        <div className="empty" role="alert" style={{ marginTop: 22 }}>
          <b>Não carregou</b>
          <p>
            {getUserFacingMessage(
              hoje.error,
              'Não deu para montar a rodada agora.'
            )}
          </p>
          {isRetryableError(hoje.error) ? (
            <button
              type="button"
              className="btn b-ink sm"
              onClick={() => void hoje.refetch()}
            >
              Tentar de novo
            </button>
          ) : null}
        </div>
      ) : hoje.isPending ? (
        <div
          className="empty"
          role="status"
          aria-busy="true"
          style={{ marginTop: 22 }}
        >
          <b>Montando a rodada</b>
        </div>
      ) : !itens.length ? (
        <div className="empty" style={{ marginTop: 22 }}>
          <b>Nada no seu raio hoje</b>
          <p>
            Não achamos bares novos até {raio} km. Aumente o raio em
            Preferências ou volte amanhã às 10:00.
          </p>
          <Link className="btn b-ink sm" to="/dashboard/preferencias">
            Ajustar o raio
          </Link>
        </div>
      ) : (
        <>
          {decididos === itens.length ? (
            <div className="rd-done">
              <span className="big">
                <Ic n="check" s={30} />
              </span>
              <span>
                <b>Rodada fechada.</b>{' '}
                {salvos
                  ? `${salvos} ${salvos === 1 ? 'bar foi' : 'bares foram'} para Seus bares.`
                  : 'Nenhum salvo hoje.'}{' '}
                Amanhã às 10:00 tem outra.
              </span>
              <Link className="btn b-ink sm" to="/dashboard/seus-bares">
                Seus bares
              </Link>
            </div>
          ) : null}
          <div className="rd-grid">
            <ol className="rd-list">
              {itens.map((item, k) => (
                <Linha
                  key={item.barId}
                  item={item}
                  k={k}
                  raio={raio}
                  now={now}
                  quente={quente === item.barId}
                  onQuente={setQuente}
                  onSalvar={() =>
                    curtir.mutate(
                      { runId: rodada?.runId ?? '', barId: item.barId },
                      {
                        onSuccess: () =>
                          avisar(`${item.name} foi para Seus bares.`)
                      }
                    )
                  }
                  onPassar={() =>
                    passar.mutate({
                      runId: rodada?.runId ?? '',
                      barId: item.barId
                    })
                  }
                  onDesfazer={() =>
                    desfazer.mutate({
                      runId: rodada?.runId ?? '',
                      barId: item.barId
                    })
                  }
                  onAlerta={(ligar) => {
                    const sportId = item.facts.usualSports[0]?.id
                    if (!sportId) return
                    avisarAlerta.mutate(
                      {
                        barId: item.barId,
                        sportId,
                        on: ligar,
                        runId: rodada?.runId
                      },
                      {
                        onSuccess: () =>
                          avisar(
                            ligar
                              ? `Avisamos no app quando o ${item.name} publicar jogo.`
                              : 'Aviso desligado.'
                          )
                      }
                    )
                  }}
                />
              ))}
            </ol>
            <aside className="rd-map" aria-label="Os bares no mapa">
              <div className="rd-mapw">
                <OnsideMap
                  bars={itens.map((item) => ({
                    id: item.barId,
                    name: item.name,
                    lat: Number(item.latitude),
                    lng: Number(item.longitude),
                    pin: 'starter' as const
                  }))}
                  center={{ lat: centro.lat, lng: centro.lng }}
                  showUserLocation={Boolean(aparelho)}
                  radiusKm={raio}
                  hoveredId={quente}
                  onHover={setQuente}
                />
              </div>
              <p className="rd-cap">
                <Ic n="pin" s={14} />
                Todos a até {raio} km de você. Passe o mouse num bar para achar
                no mapa.
              </p>
            </aside>
          </div>
        </>
      )}
    </div>
  )
}

function Linha({
  item,
  k,
  raio,
  now,
  quente,
  onQuente,
  onSalvar,
  onPassar,
  onDesfazer,
  onAlerta
}: {
  item: Suggestion
  k: number
  raio: number
  now: number
  quente: boolean
  onQuente: (id: string | null) => void
  onSalvar: () => void
  onPassar: () => void
  onDesfazer: () => void
  onAlerta: (ligar: boolean) => void
}) {
  const topo = k === 0
  const alertaLigado = item.alerts.sportIds.length > 0
  const esporte = item.facts.usualSports[0]?.name
  return (
    <li
      className={`rd-row${topo ? ' rd-top' : ''}${item.decision === 'liked' ? ' rd-save' : item.decision === 'passed' ? ' rd-skip' : ''}${quente ? ' hot' : ''}`}
      onMouseEnter={() => onQuente(item.barId)}
      onMouseLeave={() => onQuente(null)}
    >
      <span className="rd-n" aria-hidden="true">
        {k + 1}
      </span>
      <Link
        className="rd-ph"
        to="/pub/$pubId"
        params={{ pubId: item.barId }}
        aria-label={`Abrir ${item.name}`}
      >
        {item.photoUrl ? (
          <img
            src={item.photoUrl}
            alt=""
            width={480}
            height={360}
            loading="lazy"
          />
        ) : (
          <span className="ph-vazio">
            <Ic n="beer" s={36} />
          </span>
        )}
        {topo ? (
          <span className="rd-match">
            <Ic n="sparkle" s={14} />
            Mais a sua cara hoje
          </span>
        ) : null}
      </Link>
      <div className="rd-in">
        <div className="rd-hd">
          <h3>
            <Link to="/pub/$pubId" params={{ pubId: item.barId }}>
              {item.name}
            </Link>
          </h3>
          <span className="rd-m">
            {item.neighborhood} · {distanceText(item.distanceKm)}
            {item.facts.rating
              ? ` · ${item.facts.rating.percentage}% voltariam`
              : ''}
          </span>
        </div>
        <ul className="rd-why" aria-label="Por que combina">
          {whyLines(item, raio).map((linha) => (
            <li key={linha}>
              <Ic n="check" s={16} />
              {linha}
            </li>
          ))}
        </ul>
        {item.game ? (
          <div className="rd-g">
            <span className="rd-gl">Próximo jogo aqui</span>
            <b>
              {getGameTitle({
                ...item.game,
                participants: item.game.participants
              })}
            </b>
            <span className="rd-gt mono">
              {gameWhen(item.game.startsAt, now).toLowerCase()}
              {item.game.going ? ` · ${item.game.going.count} vão` : ''}
            </span>
          </div>
        ) : null}
      </div>
      <div className="rd-acts">
        {item.decision === 'liked' ? (
          <>
            <span className="rd-st">
              <Ic n="heart" s={16} />
              Em Seus bares
            </span>
            <button className="rd-undo" type="button" onClick={onDesfazer}>
              Desfazer
            </button>
          </>
        ) : item.decision === 'passed' ? (
          <>
            <span className="rd-st">Fica para outro dia</span>
            <button className="rd-undo" type="button" onClick={onDesfazer}>
              Desfazer
            </button>
          </>
        ) : (
          <>
            <button className="btn b-acid sm" type="button" onClick={onSalvar}>
              <Ic n="heart" s={18} />
              Salvar
            </button>
            <button className="btn b-ghost sm" type="button" onClick={onPassar}>
              Agora não
            </button>
            {esporte ? (
              <button
                className={`rd-alert${alertaLigado ? ' on' : ''}`}
                type="button"
                aria-pressed={alertaLigado}
                aria-label={`Avisar quando ${item.name} publicar jogo de ${esporte}`}
                onClick={() => onAlerta(!alertaLigado)}
              >
                <Ic n="bell" s={18} />
              </button>
            ) : null}
          </>
        )}
      </div>
    </li>
  )
}
