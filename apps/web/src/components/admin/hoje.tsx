import type { AppRouter } from '@findsports_oficial/api/routers/index'
import { gameTitle } from '@findsports_oficial/db/game-title'
import { Skeleton } from '@findsports_oficial/ui/components/skeleton'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import type { inferRouterOutputs } from '@trpc/server'
import { type ReactNode, useId, useState } from 'react'
import { useMinuteNow } from '@/components/app/minute-tick'
import {
  Avatar,
  Badge,
  CabecalhoCard,
  CabecalhoPagina,
  Card,
  EmBreve,
  Icone,
  IconeBotao,
  Kpi,
  Progresso,
  propsBotao,
  Toggle
} from '@/components/painel'
import { countLabel, plural } from '@/lib/plural'
import { BAR_RESERVATIONS_QUERY } from '@/lib/query-cache'
import { getUserFacingMessage, isRetryableError } from '@/lib/user-facing-error'
import { useTRPC } from '@/utils/trpc'
import {
  useMyAnalyticsEntitlements,
  useMyBar,
  useMyEvents,
  useMySubscription,
  useShowsGoing
} from './admin-queries'
import {
  chegadasDoDia,
  dataCurta,
  diaDaCasa,
  hora,
  montarNoite,
  nomeDoDia,
  posicao,
  rotuloHora,
  semanaDe,
  somaDias,
  somaDosJogos,
  validadosAte,
  vaoPorDia,
  variacao
} from './hoje-model'
import { QueryError } from './query-error'
import './hoje.css'

type RouterOutputs = inferRouterOutputs<AppRouter>

type Chegada = ReturnType<
  typeof chegadasDoDia<RouterOutputs['barReservations']['going'][number]>
>[number]

const SEM_TOAST = { meta: { errorToast: false } } as const

const numero = (n: number) => n.toLocaleString('pt-BR')

/**
 * "Hoje na casa" (`/admin`, telas 1j/1k e, no tablet, 1l/1m do design "Bar
 * Web"): o que acontece no bar hoje à noite e como foi a semana.
 *
 * Regras de plano: quem vai, quem chegou e os códigos são da lista do Elite
 * (`canViewReservations`; o servidor manda `null` para os outros planos, e a
 * tela mostra "—", nunca zero). "Chegaram agora" segue "Quem vai"
 * (`useShowsGoing`); a oferta da casa, o plano Elite vigente. Rota pedida só a
 * partir do Pro, como nas analytics.
 *
 * "Novo jogo" leva a `/admin/jogos?novo=1`, que abre o formulário de jogo novo.
 */
export function Hoje() {
  const trpc = useTRPC()
  const now = useMinuteNow()
  const { data: bar } = useMyBar()
  const events = useMyEvents()
  const { data: subscription } = useMySubscription()
  const entitlements = useMyAnalyticsEntitlements()
  const showsGoing = useShowsGoing() === true

  const noite = montarNoite(events.data ?? [], now)
  const dias = semanaDe(noite.dia).map((d) => d.dia)
  const segunda = dias[0] ?? noite.dia
  const domingo = dias[6] ?? noite.dia
  const lista = entitlements.data?.canViewReservations === true

  const semana = useQuery({
    ...trpc.commercialAnalytics.getMyEventAnalytics.queryOptions({
      from: segunda,
      to: domingo
    }),
    refetchInterval: 60_000,
    ...SEM_TOAST
  })
  const passada = useQuery({
    ...trpc.commercialAnalytics.getMyEventAnalytics.queryOptions({
      from: somaDias(segunda, -7),
      to: somaDias(domingo, -7)
    }),
    enabled: lista,
    ...SEM_TOAST
  })
  const visao = useQuery({
    ...trpc.commercialAnalytics.getMyAnalyticsOverview.queryOptions({
      from: segunda,
      to: noite.dia
    }),
    ...SEM_TOAST
  })
  const going = useQuery({
    ...trpc.barReservations.going.queryOptions(),
    ...BAR_RESERVATIONS_QUERY,
    enabled: showsGoing,
    ...SEM_TOAST
  })
  const ratings = useQuery({
    ...trpc.pub.getMyRatings.queryOptions(),
    ...SEM_TOAST
  })

  if (!bar) return null

  const idsDaNoite = new Set(noite.blocos.map((b) => b.jogo.id))
  // undefined: carregando; null: o plano não mostra.
  const hoje =
    !semana.data || !entitlements.data
      ? undefined
      : lista
        ? somaDosJogos(semana.data.events, idsDaNoite)
        : null
  const contagem = (de: (h: NonNullable<typeof hoje>) => number) =>
    semana.isPending || entitlements.isPending ? (
      <Carregando />
    ) : hoje ? (
      de(hoje)
    ) : (
      '—'
    )
  const porJogo = new Map(semana.data?.events.map((e) => [e.eventId, e]))
  const ofertaLiberada = subscription?.currentPlan === 'elite'
  const proximo = (events.data ?? []).find(
    (e) => new Date(e.startsAt).getTime() > now
  )

  return (
    <div className="hoje">
      <CabecalhoPagina
        kicker={`${dataCurta(noite.dia)} · ${bar.neighborhood}`}
        titulo="Hoje na casa"
        tamanho={60}
        acoes={
          <>
            <Link
              to="/pub/$pubId"
              params={{ pubId: bar.id }}
              target="_blank"
              {...propsBotao({ variante: 'sec' }, 'hoje-ver-app')}
            >
              <IconeBotao nome="share" />
              Ver no app
            </Link>
            <Link
              to="/admin/jogos"
              search={{ novo: 1 }}
              {...propsBotao({ variante: 'acid' })}
            >
              <IconeBotao nome="plus" variante="acid" />
              Novo jogo
            </Link>
          </>
        }
      >
        <b>{countLabel(noite.blocos.length, 'jogo', 'jogos')}</b>
        {hoje ? (
          <>
            {' · '}
            <b>{countLabel(hoje.vao, 'vai assistir', 'vão assistir')}</b>
            {' · '}
            <b>
              {hoje.chegaram}{' '}
              {plural(hoje.chegaram, 'já chegou', 'já chegaram')}
            </b>
          </>
        ) : null}
      </CabecalhoPagina>

      <section className="hoje-kpis" aria-label="Números de hoje">
        <Kpi
          valor={events.isPending ? <Carregando /> : noite.blocos.length}
          rotulo="jogos hoje"
        />
        <Kpi
          kind="hero"
          destaque
          topo={entitlements.data && !lista ? <SoElite /> : null}
          valor={contagem((h) => h.vao)}
          rotulo="vão assistir hoje"
        />
        <Kpi
          topo={entitlements.data && !lista ? <SoElite /> : null}
          valor={contagem((h) => h.chegaram)}
          rotulo="códigos validados"
        />
        <Kpi
          topo={
            <span className="hoje-kpi-topo">
              <Sinal />
              <EmBreve />
            </span>
          }
          valor="—"
          rotulo={`interesse acima do seu normal de ${nomeDoDia(noite.dia)}`}
        />
      </section>

      <Card className="hoje-noite-card">
        <CabecalhoCard
          titulo="A noite"
          meta={`${noite.de % 24}h → ${noite.ate % 24}h`}
        />
        {events.isError ? (
          <div className="hoje-espaco">
            <QueryError
              message={getUserFacingMessage(
                events.error,
                'Não foi possível carregar os jogos.'
              )}
              retryable={isRetryableError(events.error)}
              onRetry={() => void events.refetch()}
            />
          </div>
        ) : (
          <div className="hoje-noite-rolagem">
            <div
              className="hoje-noite"
              style={{ height: Math.max(196, 40 + noite.linhas * 78) }}
            >
              <div className="hoje-horas" aria-hidden="true">
                {noite.horas.map((h) => (
                  <div key={h}>
                    <span>{rotuloHora(h)}</span>
                  </div>
                ))}
              </div>
              {events.isPending || noite.blocos.length === 0 ? null : (
                <ul aria-label="Jogos de hoje">
                  {noite.blocos.map((b) => {
                    const de = posicao(b.inicio, noite.de, noite.ate)
                    const ate = posicao(b.fim, noite.de, noite.ate)
                    const linha = porJogo.get(b.jogo.id)
                    const vao = lista ? linha?.reservedPeople : null
                    const chegaram = linha?.arrivals ?? 0
                    return (
                      <li
                        key={b.jogo.id}
                        className="hoje-jogo"
                        data-estado={b.estado}
                        style={{
                          left: `${de}%`,
                          width: `calc(${ate - de}% - 4px)`,
                          top: 30 + b.linha * 78
                        }}
                      >
                        <div className="hoje-jogo-topo">
                          <b>{gameTitle(b.jogo)}</b>
                          {b.estado === 'live' ? (
                            <Badge tipo="live">Ao vivo</Badge>
                          ) : b.estado === 'past' ? (
                            <Badge tipo="muted">Encerrado</Badge>
                          ) : (
                            <Badge tipo="pub">Publicado</Badge>
                          )}
                        </div>
                        <span className="hoje-jogo-linha">
                          {hora(b.jogo.startsAt)} ·{' '}
                          {vao == null
                            ? b.jogo.championship
                            : vao > 0
                              ? `${vao} ${plural(vao, 'vai', 'vão')} · ${chegaram} ${plural(chegaram, 'chegou', 'chegaram')}`
                              : 'ninguém marcou ainda'}
                        </span>
                        {vao ? (
                          <Progresso
                            valor={chegaram}
                            max={vao}
                            altura={4}
                            rotulo={`${chegaram} de ${vao} chegaram`}
                          />
                        ) : null}
                      </li>
                    )
                  })}
                </ul>
              )}
              {noite.agora === null ? null : (
                <div
                  className="hoje-agora"
                  style={{
                    left: `${posicao(noite.agora, noite.de, noite.ate)}%`
                  }}
                >
                  <span>AGORA {hora(now)}</span>
                </div>
              )}
              {events.isSuccess && noite.blocos.length === 0 ? (
                <p className="hoje-noite-vazia">
                  <span>Nenhum jogo marcado para hoje.</span>
                </p>
              ) : null}
            </div>
          </div>
        )}
      </Card>

      <div
        className="hoje-grade"
        data-colunas={ofertaLiberada || showsGoing ? 3 : 2}
      >
        {ofertaLiberada || showsGoing ? (
          <div className="hoje-coluna">
            {ofertaLiberada ? <OfertaDaCasa oferta={bar.houseOffer} /> : null}
            {showsGoing ? (
              <ChegaramAgora
                chegadas={
                  going.data ? chegadasDoDia(going.data, noite.dia) : undefined
                }
                validados={hoje?.chegaram}
                comOferta={bar.houseOffer !== null}
                erro={going.isError ? () => void going.refetch() : null}
              />
            ) : null}
          </div>
        ) : null}

        <Card className="hoje-semana">
          <CabecalhoCard titulo="Esta semana" meta="vs. semana passada" />
          {visao.isError ? (
            <Falha tentar={() => void visao.refetch()} />
          ) : (
            <ul className="hoje-semana-lista">
              <LinhaSemana
                valor={visao.data?.uniqueVisitors}
                rotulo="viram o bar"
                variacao={visao.data?.uniqueVisitorsChange}
              />
              {lista ? (
                <LinhaSemana
                  valor={
                    semana.data
                      ? validadosAte(semana.data.events, noite.dia)
                      : undefined
                  }
                  rotulo="códigos validados"
                  variacao={
                    semana.data && passada.data
                      ? variacao(
                          validadosAte(semana.data.events, noite.dia),
                          validadosAte(
                            passada.data.events,
                            somaDias(noite.dia, -7)
                          )
                        )
                      : null
                  }
                />
              ) : null}
              <LinhaSemana valor={null} rotulo="salvaram" emBreve />
              {visao.data?.directionsOpened == null ? null : (
                <LinhaSemana
                  valor={visao.data.directionsOpened}
                  rotulo="pediram rota"
                  variacao={visao.data.directionsOpenedChange}
                />
              )}
            </ul>
          )}
          {lista && semana.data ? (
            <VaoPorDia
              dias={semanaDe(noite.dia)}
              valores={vaoPorDia(semana.data.events, dias)}
              hoje={noite.dia}
            />
          ) : null}
        </Card>

        <div className="hoje-coluna">
          <Card className="hoje-avaliacoes">
            <CabecalhoCard
              titulo="Avaliações recentes"
              meta={
                ratings.data?.total
                  ? `${ratings.data.percentage}% voltariam`
                  : undefined
              }
            />
            {ratings.isError ? (
              <Falha tentar={() => void ratings.refetch()} />
            ) : !ratings.data ? (
              <Carregando linhas={2} />
            ) : ratings.data.recent.length === 0 ? (
              <p className="hoje-vazio">Ninguém avaliou ainda.</p>
            ) : (
              <ul className="hoje-lista">
                {ratings.data.recent.slice(0, 2).map((r) => (
                  <li key={`${r.startsAt}-${r.createdAt}`}>
                    <span className="hoje-voto" data-sim={r.wouldReturn}>
                      <Icone
                        nome={r.wouldReturn ? 'check' : 'x'}
                        tamanho={16}
                        acento="currentColor"
                      />
                    </span>
                    <div>
                      <b>{gameTitle(r)}</b>
                      <span>
                        {r.wouldReturn ? 'Voltaria' : 'Não voltaria'} ·{' '}
                        {dataCurta(diaDaCasa(r.startsAt))}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {proximo ? (
            <div className="hoje-promo" aria-disabled="true">
              <Icone
                nome="bolt"
                tamanho={28}
                acento="var(--painel-ink)"
                base={1}
              />
              <div>
                <b>{gameTitle(proximo)} em destaque?</b>
                <span>
                  {dataCurta(diaDaCasa(proximo.startsAt))} ·{' '}
                  {hora(proximo.startsAt)}
                </span>
              </div>
              <Badge tipo="ink">em breve</Badge>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

const ESQUELETO = ['a', 'b', 'c', 'd'] as const

function Carregando({ linhas }: { linhas?: number }) {
  if (linhas) {
    return (
      <div className="hoje-espaco" role="status" aria-busy="true">
        <span className="sr-only">Carregando…</span>
        {ESQUELETO.slice(0, linhas).map((k) => (
          <Skeleton
            key={k}
            className="mb-3 h-10 w-full bg-[var(--painel-sub)]"
          />
        ))}
      </div>
    )
  }
  return (
    <Skeleton className="inline-block h-[0.9em] w-12 bg-[var(--painel-sub)]" />
  )
}

function Falha({ tentar }: { tentar: () => void }) {
  return (
    <p className="hoje-vazio" role="alert">
      Não foi possível carregar.{' '}
      <button type="button" onClick={tentar} className="hoje-tentar">
        Tentar de novo
      </button>
    </p>
  )
}

/** O plano não mostra este número: o selo diz qual mostra. */
function SoElite() {
  return (
    <Link to="/plan" search={{ origin: 'admin' }} className="hoje-selo-plano">
      <Badge tipo="muted">Elite</Badge>
    </Link>
  )
}

/** As barrinhas de sinal acima do "interesse" (`bars` do design). */
function Sinal() {
  return (
    <span className="hoje-sinal" aria-hidden="true">
      {[6, 10, 14, 18].map((h) => (
        <span key={h} style={{ height: h }} />
      ))}
    </span>
  )
}

function OfertaDaCasa({ oferta }: { oferta: string | null }) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const tituloId = useId()
  // O servidor não tem "liga/desliga": desligar apaga o texto. Ele fica
  // guardado aqui para religar na mesma visita sem reescrever.
  const [guardada, setGuardada] = useState<string | null>(null)
  const salvar = useMutation(
    trpc.pub.updateHouseOffer.mutationOptions({
      onSuccess: () =>
        Promise.all([
          queryClient.invalidateQueries({
            queryKey: trpc.pub.getMe.queryKey()
          }),
          queryClient.invalidateQueries({
            queryKey: trpc.pubs.getById.pathKey()
          })
        ])
    })
  )
  const ligada = salvar.isPending
    ? salvar.variables.houseOffer !== null
    : oferta !== null
  const texto = oferta ?? guardada

  return (
    <Card kind="hero" className="hoje-oferta">
      <Icone nome="ticket" tamanho={28} />
      <div className="hoje-oferta-texto">
        <b id={tituloId}>Oferta da casa</b>
        <span>{texto ?? 'Nenhuma oferta escrita.'}</span>
        {salvar.error ? (
          <span role="alert" className="hoje-erro">
            {getUserFacingMessage(
              salvar.error,
              'Não foi possível salvar a oferta. Tente novamente.'
            )}
          </span>
        ) : null}
      </div>
      <Toggle
        ligado={ligada}
        aria-labelledby={tituloId}
        disabled={salvar.isPending}
        onChange={(ligar) => {
          if (!ligar) {
            setGuardada(oferta)
            salvar.mutate({ houseOffer: null })
          } else if (guardada) {
            salvar.mutate({ houseOffer: guardada })
          } else {
            void navigate({ to: '/admin/meu-espaco' })
          }
        }}
      />
    </Card>
  )
}

function ChegaramAgora({
  chegadas,
  validados,
  comOferta,
  erro
}: {
  chegadas: Chegada[] | undefined
  /** Códigos validados hoje (analytics); sem ele, conta a lista. */
  validados: number | undefined
  comOferta: boolean
  erro: (() => void) | null
}) {
  const total = validados ?? chegadas?.length
  return (
    <Card className="hoje-chegaram">
      <CabecalhoCard
        titulo="Chegaram agora"
        meta={
          total === undefined
            ? undefined
            : `${total} ${plural(total, 'validado', 'validados')}`
        }
      />
      {erro ? (
        <Falha tentar={erro} />
      ) : !chegadas ? (
        <Carregando linhas={3} />
      ) : chegadas.length === 0 ? (
        <p className="hoje-vazio">Ninguém validou o código hoje.</p>
      ) : (
        <ul className="hoje-lista">
          {chegadas.slice(0, 4).map((c, i) => (
            <li key={`${c.jogo.id}-${c.nome}-${c.em.getTime()}`}>
              <Avatar nome={c.nome} ativo={i === 0} />
              <div>
                <b>{c.nome}</b>
                <span>
                  {hora(c.em)} · {gameTitle(c.jogo)}
                </span>
              </div>
              <Badge tipo="acid">
                ✓ {comOferta ? 'Oferta liberada' : 'Validado'}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function LinhaSemana({
  valor,
  rotulo,
  variacao,
  emBreve
}: {
  /** undefined: carregando. */
  valor: number | null | undefined
  rotulo: string
  variacao?: number | null
  emBreve?: boolean
}) {
  let selo: ReactNode = null
  if (emBreve) selo = <EmBreve />
  else if (variacao && variacao > 0)
    selo = <Badge tipo="acid">↑ +{variacao}%</Badge>
  else if (variacao && variacao < 0)
    selo = <Badge tipo="muted">↓ {variacao}%</Badge>
  return (
    <li>
      <span className="hoje-semana-n">
        {valor === undefined ? (
          <Carregando />
        ) : valor === null ? (
          '—'
        ) : (
          numero(valor)
        )}
      </span>
      <span className="hoje-semana-rotulo">{rotulo}</span>
      {selo}
    </li>
  )
}

function VaoPorDia({
  dias,
  valores,
  hoje
}: {
  dias: { dia: string; rotulo: string }[]
  valores: number[]
  hoje: string
}) {
  const max = Math.max(1, ...valores)
  return (
    <ol className="hoje-dias" aria-label="Vão assistir por dia">
      {dias.map((d, i) => {
        const v = valores[i] ?? 0
        return (
          <li key={d.dia} data-hoje={d.dia === hoje || undefined}>
            <span className="hoje-dias-n">{v}</span>
            <span
              className="hoje-dias-barra"
              style={{ height: Math.max(2, Math.round((v / max) * 70)) }}
            />
            <span className="hoje-dias-rotulo">
              <span className="sr-only">{dataCurta(d.dia)}: </span>
              <span aria-hidden="true">{d.rotulo}</span>
            </span>
          </li>
        )
      })}
    </ol>
  )
}
