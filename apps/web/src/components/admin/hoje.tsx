import { reasonLabel } from '@findsports_oficial/api/lib/rating-reasons'
import type { AppRouter } from '@findsports_oficial/api/routers/index'
import { gameTitle } from '@findsports_oficial/db/game-title'
import { Skeleton } from '@findsports_oficial/ui/components/skeleton'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import type { inferRouterOutputs } from '@trpc/server'
import { type ReactNode, useId, useRef, useState } from 'react'
import { useMinuteNow } from '@/components/app/minute-tick'
import {
  Avatar,
  Badge,
  CabecalhoCard,
  CabecalhoPagina,
  Card,
  EmBreve,
  ErroBloco,
  Icone,
  IconeBotao,
  Kpi,
  Progresso,
  propsBotao,
  Toggle
} from '@/components/painel'
import { ehRascunho } from '@/domain/painel-jogos'
import { countLabel, plural } from '@/lib/plural'
import { BAR_RESERVATIONS_QUERY } from '@/lib/query-cache'
import { getUserFacingMessage } from '@/lib/user-facing-error'
import { useTRPC } from '@/utils/trpc'
import {
  useMyAnalyticsEntitlements,
  useMyBar,
  useMyEventCreationPolicy,
  useMyEvents,
  useMySubscription,
  useShowsGoing
} from './admin-queries'
import { AvisoDoPainel, CardDoPlano } from './avisos'
import { buildSeries, niceMax } from './daily-chart-model'
import {
  numerosDoDesempenho,
  serieDiaria,
  ultimos30Dias,
  useDesempenho
} from './desempenho-dados'
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
  somaDosJogos
} from './hoje-model'
import './hoje.css'

type RouterOutputs = inferRouterOutputs<AppRouter>

type Chegada = ReturnType<
  typeof chegadasDoDia<RouterOutputs['barReservations']['going'][number]>
>[number]

const SEM_TOAST = { meta: { errorToast: false } } as const

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
 * "Novo jogo" leva a `/admin/jogos?novo=1`, que abre o formulário de jogo novo;
 * sem poder criar (limite do Starter, bar fora do ar), vira "Ver grade".
 *
 * Rodada 3 (1r–1w): o aviso do momento abaixo do título, o "Desempenho do
 * bar" dos últimos 30 dias no meio e o card do plano à direita. Fora do ar,
 * o resto da tela fica apagado.
 */
export function Hoje() {
  const trpc = useTRPC()
  const now = useMinuteNow()
  const { data: bar } = useMyBar()
  const events = useMyEvents()
  const { data: subscription } = useMySubscription()
  const { data: politica } = useMyEventCreationPolicy()
  const entitlements = useMyAnalyticsEntitlements()
  const showsGoing = useShowsGoing() === true

  const noite = montarNoite(events.data ?? [], now)
  const dias = semanaDe(noite.dia).map((d) => d.dia)
  const domingo = dias[0] ?? noite.dia
  const sabado = dias[6] ?? noite.dia
  const lista = entitlements.data?.canViewReservations === true

  const semana = useQuery({
    ...trpc.commercialAnalytics.getMyEventAnalytics.queryOptions({
      from: domingo,
      to: sabado
    }),
    refetchInterval: 60_000,
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
  const fora = bar.isActive === false
  const bloqueado = politica?.canCreate === false

  return (
    <div className="hoje" data-fora={fora || undefined}>
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
            {bloqueado ? (
              <Link to="/admin/jogos" {...propsBotao({ variante: 'sec' })}>
                Ver grade
              </Link>
            ) : (
              <Link
                to="/admin/jogos"
                search={{ novo: 1 }}
                {...propsBotao({ variante: 'acid' })}
              >
                <IconeBotao nome="plus" variante="acid" />
                Novo jogo
              </Link>
            )}
          </>
        }
      >
        {fora ? (
          'Fora das buscas e do mapa'
        ) : (
          <b>{countLabel(noite.blocos.length, 'jogo', 'jogos')}</b>
        )}
        {hoje && !fora ? (
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

      <AvisoDoPainel tela="hoje" />

      <section className="hoje-kpis hoje-apaga" aria-label="Números de hoje">
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

      <Secao
        className="hoje-noite-card hoje-apaga"
        titulo="A noite"
        meta={
          fora
            ? 'Os jogos não aparecem no app enquanto o bar estiver fora do ar'
            : `${noite.de % 24}h → ${noite.ate % 24}h · arraste para ver amanhã`
        }
      >
        {events.isError ? (
          <div className="hoje-espaco">
            <ErroBloco
              titulo="Não foi possível carregar os jogos."
              erro={events.error}
              tentar={events.refetch}
              tentando={events.isFetching}
            />
          </div>
        ) : (
          <LinhaDaNoite
            noite={noite}
            now={now}
            carregando={events.isPending}
            linhaDoJogo={(id) => porJogo.get(id)}
            lista={lista}
          />
        )}
      </Secao>

      <div
        className="hoje-grade"
        data-colunas={ofertaLiberada || showsGoing ? 3 : 2}
      >
        {ofertaLiberada || showsGoing ? (
          <div className="hoje-coluna hoje-apaga">
            {ofertaLiberada ? <OfertaDaCasa oferta={bar.houseOffer} /> : null}
            {showsGoing ? (
              <ChegaramAgora
                chegadas={
                  going.data ? chegadasDoDia(going.data, noite.dia) : undefined
                }
                validados={hoje?.chegaram}
                comOferta={bar.houseOffer !== null}
                erro={going.isError ? going : null}
              />
            ) : null}
          </div>
        ) : null}

        <DesempenhoMini />

        <div className="hoje-coluna">
          <CardDoPlano />
          <Secao
            className="hoje-avaliacoes"
            titulo="Avaliações recentes"
            meta={
              ratings.data?.total
                ? `${ratings.data.percentage}% voltariam`
                : undefined
            }
          >
            {ratings.isError ? (
              <Falha consulta={ratings} />
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
                      {r.reasons.length > 0 ? (
                        <span>{r.reasons.map(reasonLabel).join(' · ')}</span>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Secao>
        </div>
      </div>
    </div>
  )
}

type Noite = ReturnType<
  typeof montarNoite<RouterOutputs['pub']['getMyEvents'][number]>
>
type LinhaDoJogo =
  RouterOutputs['commercialAnalytics']['getMyEventAnalytics']['events'][number]

/**
 * A linha do tempo de "A noite": a de hoje ocupa a largura do card e a de
 * amanhã fica à direita. Arrasta com o dedo (rolagem nativa), com o mouse e,
 * com o foco nela, anda uma hora por seta (Home e End vão às pontas).
 */
function LinhaDaNoite({
  noite,
  now,
  carregando,
  linhaDoJogo,
  lista
}: {
  noite: Noite
  now: number
  carregando: boolean
  linhaDoJogo: (id: string) => LinhaDoJogo | undefined
  lista: boolean
}) {
  const arrasto = useRef<{ x: number; rolagem: number } | null>(null)
  const [arrastando, setArrastando] = useState(false)
  const hoje = noite.horas.length
  const total = hoje + noite.amanha.horas.length
  const linhas = Math.max(noite.linhas, noite.amanha.linhas)
  const soltar = () => {
    arrasto.current = null
    setArrastando(false)
  }

  const faixas = [
    { faixa: noite, antes: 0, vazia: 'Nenhum jogo marcado para hoje.' },
    {
      faixa: noite.amanha,
      antes: hoje,
      vazia: 'Nenhum jogo marcado para amanhã.'
    }
  ]

  return (
    <section
      className="hoje-noite-rolagem"
      // biome-ignore lint/a11y/noNoninteractiveTabindex: rolagem que anda pelas setas precisa do foco (WCAG 2.1.1).
      tabIndex={0}
      aria-label="A noite, de hoje até amanhã. Use as setas para andar pelas horas."
      data-arrastando={arrastando || undefined}
      onPointerDown={(e) => {
        if (e.pointerType !== 'mouse' || e.button !== 0) return
        arrasto.current = { x: e.clientX, rolagem: e.currentTarget.scrollLeft }
        e.currentTarget.setPointerCapture(e.pointerId)
        setArrastando(true)
      }}
      onPointerMove={(e) => {
        const a = arrasto.current
        if (a) e.currentTarget.scrollLeft = a.rolagem - (e.clientX - a.x)
      }}
      onPointerUp={soltar}
      onPointerCancel={soltar}
      onKeyDown={(e) => {
        const el = e.currentTarget
        const hora = el.scrollWidth / total
        const passo = {
          ArrowRight: hora,
          ArrowLeft: -hora,
          Home: -el.scrollWidth,
          End: el.scrollWidth
        }[e.key]
        if (passo === undefined) return
        e.preventDefault()
        // Tecla não anima: a hora salta na hora (e o reduzir movimento vale sozinho).
        el.scrollBy({ left: passo, behavior: 'instant' })
      }}
    >
      <div
        className="hoje-noite"
        style={{
          height: Math.max(196, 40 + linhas * 78),
          ['--colunas' as string]: total,
          ['--colunas-hoje' as string]: hoje
        }}
      >
        <div className="hoje-horas" aria-hidden="true">
          {noite.horas.map((h) => (
            <div key={h}>
              <span>{rotuloHora(h)}</span>
            </div>
          ))}
          {noite.amanha.horas.map((h, i) => (
            <div key={`amanha-${h}`} data-amanha={i === 0 || undefined}>
              <span>
                {i === 0 ? `amanhã · ${rotuloHora(h)}` : rotuloHora(h)}
              </span>
            </div>
          ))}
        </div>
        {carregando
          ? null
          : faixas.map(({ faixa, antes, vazia }) => {
              const ondeEsta = (h: number) =>
                posicao(h, faixa.de, faixa.ate, antes, total)
              if (faixa.blocos.length === 0) {
                return (
                  <p
                    key={faixa.dia}
                    className="hoje-noite-vazia"
                    style={{
                      left: `${ondeEsta(faixa.de)}%`,
                      width: `${ondeEsta(faixa.ate) - ondeEsta(faixa.de)}%`
                    }}
                  >
                    <span>{vazia}</span>
                  </p>
                )
              }
              return (
                <ul
                  key={faixa.dia}
                  aria-label={antes ? 'Jogos de amanhã' : 'Jogos de hoje'}
                >
                  {faixa.blocos.map((b) => {
                    const de = ondeEsta(b.inicio)
                    const ate = ondeEsta(b.fim)
                    const linha = linhaDoJogo(b.jogo.id)
                    const rascunho = ehRascunho(b.jogo)
                    const vao =
                      lista && !rascunho ? linha?.reservedPeople : null
                    const chegaram = linha?.arrivals ?? 0
                    return (
                      <li
                        key={b.jogo.id}
                        className="hoje-jogo"
                        data-estado={rascunho ? 'draft' : b.estado}
                        style={{
                          left: `${de}%`,
                          width: `calc(${ate - de}% - 4px)`,
                          top: 30 + b.linha * 78
                        }}
                      >
                        <div className="hoje-jogo-topo">
                          <b>{gameTitle(b.jogo)}</b>
                          {rascunho ? (
                            <Badge tipo="draft">Rascunho</Badge>
                          ) : b.estado === 'live' ? (
                            <Badge tipo="live">Ao vivo</Badge>
                          ) : b.estado === 'past' ? (
                            <Badge tipo="muted">Encerrado</Badge>
                          ) : (
                            <Badge tipo="pub">Publicado</Badge>
                          )}
                        </div>
                        <span className="hoje-jogo-linha">
                          {hora(b.jogo.startsAt)} ·{' '}
                          {rascunho
                            ? 'rascunho'
                            : vao == null
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
              )
            })}
        {noite.agora === null ? null : (
          <div
            className="hoje-agora"
            style={{
              left: `${posicao(noite.agora, noite.de, noite.ate, 0, total)}%`
            }}
          >
            <span>AGORA {hora(now)}</span>
          </div>
        )}
      </div>
    </section>
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

type Consulta = {
  error: unknown
  refetch: () => unknown
  isFetching: boolean
}

/** O card pequeno que não carregou: a linha só (WEB-460). */
function Falha({ consulta }: { consulta: Consulta }) {
  return (
    <ErroBloco
      compacto
      titulo="Não foi possível carregar."
      erro={consulta.error}
      tentar={consulta.refetch}
      tentando={consulta.isFetching}
    />
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
  erro: Consulta | null
}) {
  const total = validados ?? chegadas?.length
  return (
    <Secao
      className="hoje-chegaram"
      titulo="Chegaram agora"
      meta={
        total === undefined
          ? undefined
          : `${total} ${plural(total, 'validado', 'validados')}`
      }
    >
      {erro ? (
        <Falha consulta={erro} />
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
    </Secao>
  )
}

/**
 * "Desempenho do bar" (1r): os três números dos últimos 30 dias, com a mesma
 * conta da página Desempenho (`desempenho-dados.ts`), e a atividade diária
 * em miniatura.
 */
function DesempenhoMini() {
  const desempenho = useDesempenho(ultimos30Dias())
  return (
    <Secao
      className="hoje-desempenho"
      titulo="Desempenho do bar"
      meta="últimos 30 dias"
    >
      {desempenho.isError ? (
        <Falha consulta={desempenho} />
      ) : !desempenho.data ? (
        <Carregando linhas={3} />
      ) : (
        <>
          <ul className="hoje-desempenho-lista">
            {numerosDoDesempenho(desempenho.data).map((n) => (
              <li key={n.metrica}>
                <div>
                  <span>{n.rotulo}</span>
                  <b>
                    <span
                      className={
                        Number.parseFloat(n.valor) > 0
                          ? 'painel-marca'
                          : undefined
                      }
                    >
                      {n.valor}
                    </span>
                  </b>
                </div>
                {n.variacao?.startsWith('+') ? (
                  <Badge tipo="acid">↑ {n.variacao}</Badge>
                ) : n.variacao ? (
                  <span className="hoje-desempenho-var">
                    {n.variacao.startsWith('-')
                      ? `↓ ${n.variacao}`
                      : n.variacao}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
          <MiniGrafico dias={serieDiaria(desempenho.data)} />
        </>
      )}
      <Link to="/admin/desempenho" className="hoje-desempenho-link">
        Ver desempenho →
      </Link>
    </Secao>
  )
}

/** A atividade diária pequena: aberturas (linha) e contatos (pontilhado). */
function MiniGrafico({
  dias
}: {
  dias: { date: string; views: number; actions: number }[]
}) {
  if (dias.length === 0) return null
  const topo = niceMax(Math.max(...dias.flatMap((d) => [d.views, d.actions])))
  const vistas = buildSeries(
    dias.map((d) => d.views),
    topo
  )
  const contatos = buildSeries(
    dias.map((d) => d.actions),
    topo
  )
  const trecho = (
    runs: typeof vistas.runs,
    parte: 'line' | 'area',
    sobe: boolean
  ) =>
    runs
      .filter((r) => r.up === sobe)
      .map((r) => r[parte])
      .join('')
  const traco = {
    fill: 'none',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    vectorEffect: 'non-scaling-stroke'
  } as const
  return (
    <div className="hoje-mini" aria-hidden="true">
      <div className="hoje-mini-eixo">
        {[topo, topo / 2, 0].map((v, i) => (
          <span key={v} style={{ top: `${i * 50}%` }}>
            {v.toLocaleString('pt-BR')}
          </span>
        ))}
      </div>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none">
        {[0, 50, 100].map((y) => (
          <line
            key={y}
            x1={0}
            x2={100}
            y1={y}
            y2={y}
            stroke="#aaa9a4"
            strokeOpacity={y === 100 ? 0.9 : 0.3}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        <path
          d={trecho(vistas.runs, 'area', true)}
          fill="var(--painel-acid)"
          fillOpacity={0.3}
        />
        <path
          d={trecho(contatos.runs, 'line', false)}
          stroke="#aaa9a4"
          strokeWidth={1.8}
          strokeDasharray="2 6"
          {...traco}
        />
        <path
          d={trecho(contatos.runs, 'line', true)}
          stroke="var(--painel-acid)"
          strokeWidth={1.8}
          strokeDasharray="2 6"
          {...traco}
        />
        <path
          d={trecho(vistas.runs, 'line', false)}
          stroke="#aaa9a4"
          strokeWidth={2.2}
          {...traco}
        />
        <path
          d={trecho(vistas.runs, 'line', true)}
          stroke="var(--painel-acid)"
          strokeWidth={3.5}
          {...traco}
        />
      </svg>
    </div>
  )
}

/** Card com título que também nomeia a região (leitor de tela e testes). */
function Secao({
  titulo,
  meta,
  className,
  children
}: {
  titulo: string
  meta?: ReactNode
  className: string
  children: ReactNode
}) {
  const id = useId()
  return (
    <Card role="region" aria-labelledby={id} className={className}>
      <CabecalhoCard id={id} titulo={titulo} meta={meta} />
      {children}
    </Card>
  )
}
