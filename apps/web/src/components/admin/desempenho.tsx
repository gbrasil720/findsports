import { Skeleton } from '@findsports_oficial/ui/components/skeleton'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { type KeyboardEvent, type PointerEvent, useState } from 'react'
import { getPlan } from '@/lib/plan-catalog'
import { getUserFacingMessage, isRetryableError } from '@/lib/user-facing-error'
import { useTRPC } from '@/utils/trpc'
import {
  Badge,
  Botao,
  CabecalhoPagina,
  Campo,
  Card,
  Icone,
  Progresso,
  Seg
} from '../painel'
import {
  type AnalyticsOverviewData,
  type EventAnalyticsRow,
  formatAnalyticsValue,
  formatInterestRate,
  getMainAction
} from './admin-model'
import {
  useMyAnalyticsEntitlements,
  useMyBar,
  useMySubscription
} from './admin-queries'
import {
  type AnalyticsDateRange,
  type AnalyticsPeriodPreset,
  formatComparisonPeriod,
  getAnalyticsRange,
  getAvailableAnalyticsPeriods
} from './analytics-period'
import { buildSeries, niceMax, tickIndexes } from './daily-chart-model'
import {
  codigosDoPeriodo,
  diaDoJogo,
  erroDoPersonalizado,
  jogosPorPublico,
  type Periodo,
  rotuloPeriodo,
  usePeriodoDesempenho
} from './desempenho-contas'
import {
  type DiaDesempenho,
  numerosDoDesempenho,
  serieDiaria,
  useDesempenho,
  variacaoPct
} from './desempenho-dados'
import type { MetricId } from './metric-glossary'
import { getMetric } from './metric-glossary'
import { MetricHint } from './metric-hint'
import { QueryError } from './query-error'

/* ─── Peças ─── */

/**
 * Número de resultado em Anton com o marca-texto (no escuro, em acid). Zero e
 * "—" ficam sem marca: o destaque é para valor entregue.
 */
export function Marca({
  children,
  tamanho
}: {
  children: string
  tamanho: number
}) {
  return (
    <span
      className="desemp-mk"
      data-vazio={Number.parseFloat(children) > 0 ? undefined : true}
      style={{ ['--desemp-mk' as string]: `${tamanho}px` }}
    >
      {children}
    </span>
  )
}

/** "+18%" sobe: selo acid com seta; queda e empate ficam em texto. */
export function Variacao({ texto }: { texto: string }) {
  if (texto.startsWith('+')) {
    return <Badge tipo="acid">↑ {texto}</Badge>
  }
  return (
    <span className="desemp-var-texto">
      {texto.startsWith('-') ? `↓ ${texto}` : texto}
    </span>
  )
}

/** Título de card com o "i" do glossário (e um selo, como o "Elite"). */
function TituloCard({
  metrica,
  selo,
  nivel = 2
}: {
  metrica: MetricId
  selo?: string
  nivel?: 2 | 3
}) {
  const H = nivel === 3 ? 'h3' : 'h2'
  return (
    <div className="desemp-titulo">
      <H>{getMetric(metrica).label}</H>
      <MetricHint metric={metrica} />
      {selo ? <Badge tipo="acid">{selo}</Badge> : null}
    </div>
  )
}

/* ─── Período ─── */

/**
 * Atalhos que o histórico do plano libera (o servidor recusa o resto) e o
 * personalizado, com as datas numa linha abaixo do cabeçalho.
 */
function useSeletorPeriodo(periodo: Periodo, escolher: (p: Periodo) => void) {
  const { data: bar } = useMyBar()
  const entitlements = useMyAnalyticsEntitlements()
  const maxDias = entitlements.data?.maxDaysRetention ?? null
  const [rascunho, setRascunho] = useState<AnalyticsDateRange | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const atalhos = entitlements.data
    ? getAvailableAnalyticsPeriods(maxDias).map((op) => ({
        valor: op.id as AnalyticsPeriodPreset,
        rotulo: op.label
      }))
    : []

  const seg = entitlements.data ? (
    <Seg
      rotulo="Período"
      valor={rascunho ? 'custom' : periodo.preset}
      onChange={(preset) => {
        setErro(null)
        if (preset === 'custom') {
          setRascunho(periodo.range)
          return
        }
        setRascunho(null)
        escolher({
          preset,
          range: getAnalyticsRange(
            preset,
            new Date(),
            bar ? new Date(bar.createdAt) : undefined
          )
        })
      }}
      itens={[...atalhos, { valor: 'custom', rotulo: 'Personalizado' }]}
    />
  ) : null

  const form = rascunho ? (
    <Card className="desemp-personalizado">
      <form
        method="post"
        onSubmit={(event) => {
          event.preventDefault()
          const problema = erroDoPersonalizado(rascunho, maxDias)
          setErro(problema)
          if (problema) return
          escolher({ preset: 'custom', range: rascunho })
          setRascunho(null)
        }}
      >
        <Campo
          rotulo="De"
          type="date"
          value={rascunho.from}
          onChange={(e) => setRascunho({ ...rascunho, from: e.target.value })}
        />
        <Campo
          rotulo="Até"
          type="date"
          value={rascunho.to}
          onChange={(e) => setRascunho({ ...rascunho, to: e.target.value })}
        />
        <Botao type="submit" variante="ink">
          Consultar período
        </Botao>
        <Botao
          type="button"
          onClick={() => {
            setRascunho(null)
            setErro(null)
          }}
        >
          Cancelar
        </Botao>
        {erro ? (
          <p className="desemp-erro" role="alert">
            {erro}
          </p>
        ) : maxDias !== null ? (
          <p className="desemp-nota">Seu plano permite até {maxDias} dias.</p>
        ) : null}
      </form>
    </Card>
  ) : null

  return { seg, form }
}

/* ─── Os três números ─── */

function Numeros({
  data,
  comparar
}: {
  data: AnalyticsOverviewData
  comparar: string | null
}) {
  return (
    <section className="desemp-kpis" aria-label="Os números do bar">
      {numerosDoDesempenho(data).map((numero, i) => (
        <Card
          key={numero.metrica}
          kind={i === 1 ? 'hero' : undefined}
          className="desemp-kpi"
        >
          <div className="desemp-kpi-rotulo">
            <h2>{numero.rotulo}</h2>
            <MetricHint metric={numero.metrica} />
          </div>
          <Marca tamanho={48}>{numero.valor}</Marca>
          <p className="desemp-apoio">{numero.apoio}</p>
          {comparar && numero.variacao ? (
            <p className="desemp-var">
              <Variacao texto={numero.variacao} /> vs {comparar}
            </p>
          ) : null}
        </Card>
      ))}
    </section>
  )
}

/* ─── Atividade diária ─── */

/** `2026-10-11` → `11/10`. */
const diaCurto = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}`

/** "dom., 11 de out." — a data vem sem hora: lida e escrita em UTC. */
const diaLongo = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString('pt-BR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC'
  })

/**
 * Aberturas (linha contínua) e WhatsApp, rota e telefone (tracejada) por dia,
 * no painel escuro: é onde o acid tem contraste para ser traço. Subida em
 * acid, com a área embaixo; queda e empate neutros. O SVG estica na largura
 * (`preserveAspectRatio="none"`) e o traço não deforma; rótulos, pontos e a
 * dica são HTML por cima, em porcentagem.
 */
export function AtividadeDiaria({
  dias,
  aberturasVar,
  acoesVar,
  comparar
}: {
  dias: DiaDesempenho[]
  aberturasVar: string | null
  acoesVar: string | null
  comparar: string | null
}) {
  const [marcado, setMarcado] = useState<number | null>(null)
  const count = dias.length
  if (!count) return null

  const top = niceMax(Math.max(...dias.flatMap((d) => [d.views, d.actions])))
  const views = buildSeries(
    dias.map((d) => d.views),
    top
  )
  const actions = buildSeries(
    dias.map((d) => d.actions),
    top
  )
  const path = (runs: typeof views.runs, part: 'line' | 'area', up: boolean) =>
    runs
      .filter((run) => run.up === up)
      .map((run) => run[part])
      .join('')

  const totais = [
    {
      rotulo: 'Aberturas',
      total: dias.reduce((s, d) => s + d.views, 0),
      variacao: aberturasVar,
      traco: 'solid'
    },
    {
      rotulo: 'WhatsApp, rota e telefone',
      total: dias.reduce((s, d) => s + d.actions, 0),
      variacao: acoesVar,
      traco: 'dashed'
    }
  ]

  // Com um dia só não há linha: o ponto fica sempre à vista.
  const ativo = marcado ?? (count === 1 ? 0 : null)
  const dia = ativo === null ? undefined : dias[ativo]
  const limita = (i: number) => Math.min(count - 1, Math.max(0, i))
  const escolher = (event: PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect()
    setMarcado(
      limita(Math.round(((event.clientX - box.left) / box.width) * (count - 1)))
    )
  }
  const teclado = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') return setMarcado(null)
    const passo =
      event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0
    if (!passo) return
    event.preventDefault()
    setMarcado((atual) => limita((atual ?? (passo > 0 ? -1 : count)) + passo))
  }
  // Traço mais fino em janela longa (12 meses, "Tudo").
  // ponytail: a série longa segue diária; agrupar por semana se ficar densa demais.
  const longa = count > 60
  const traco = {
    fill: 'none',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    vectorEffect: 'non-scaling-stroke'
  } as const

  return (
    <Card kind="hero" className="desemp-ativ" data-chart="daily">
      <h2>Atividade diária</h2>
      <dl className="desemp-ativ-totais">
        {totais.map((serie) => (
          <div key={serie.rotulo}>
            <dt>
              <span
                style={{ borderTopStyle: serie.traco as 'solid' }}
                aria-hidden="true"
              />
              {serie.rotulo}
            </dt>
            <dd>
              <span className="desemp-ativ-num">
                {serie.total.toLocaleString('pt-BR')}
              </span>
              {comparar && serie.variacao ? (
                <>
                  <Variacao texto={serie.variacao} />
                  <span>vs {comparar}</span>
                </>
              ) : null}
            </dd>
          </div>
        ))}
      </dl>

      <div className="desemp-graf">
        <div className="desemp-graf-y" aria-hidden="true">
          {[top, top / 2, 0].map((tick, i) => (
            <span key={tick} style={{ top: `${i * 50}%` }}>
              {tick.toLocaleString('pt-BR')}
            </span>
          ))}
        </div>

        {/* Controle deslizante de dia: as setas andam e o leitor de tela lê
            os valores do dia em `aria-valuetext`. */}
        <div
          className="desemp-graf-area"
          role="slider"
          tabIndex={0}
          aria-label={`Gráfico de atividade diária, de ${diaCurto(dias[0]?.date ?? '')} a ${diaCurto(dias[count - 1]?.date ?? '')}`}
          aria-valuemin={0}
          aria-valuemax={count - 1}
          aria-valuenow={ativo ?? count - 1}
          aria-valuetext={
            dia
              ? `${diaLongo(dia.date)}: ${dia.views} aberturas, ${dia.actions} em WhatsApp, rota e telefone`
              : undefined
          }
          onPointerDown={escolher}
          onPointerMove={escolher}
          onPointerLeave={(event) => {
            if (event.pointerType === 'mouse') setMarcado(null)
          }}
          onBlur={() => setMarcado(null)}
          onKeyDown={teclado}
        >
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            {[0, 50, 100].map((y) => (
              <line
                key={y}
                x1={0}
                x2={100}
                y1={y}
                y2={y}
                stroke="#aaa9a4"
                strokeOpacity={y === 100 ? 0.9 : 0.3}
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
            ))}
            <path
              data-part="area-up"
              d={path(views.runs, 'area', true)}
              fill="var(--painel-acid)"
              fillOpacity={0.3}
            />
            <path
              data-part="actions"
              d={path(actions.runs, 'line', false)}
              stroke="#aaa9a4"
              strokeWidth={longa ? 1 : 1.8}
              strokeDasharray="2 6"
              {...traco}
            />
            <path
              data-part="actions-up"
              d={path(actions.runs, 'line', true)}
              stroke="var(--painel-acid)"
              strokeWidth={longa ? 1 : 1.8}
              strokeDasharray="2 6"
              {...traco}
            />
            <path
              data-part="views"
              d={path(views.runs, 'line', false)}
              stroke="#aaa9a4"
              strokeWidth={longa ? 1.25 : 2.2}
              {...traco}
            />
            <path
              data-part="views-up"
              d={path(views.runs, 'line', true)}
              stroke="var(--painel-acid)"
              strokeWidth={longa ? 1.5 : 3.5}
              {...traco}
            />
          </svg>

          {dia && ativo !== null ? (
            <>
              <span
                className="desemp-graf-guia"
                style={{ left: `${views.xs[ativo]}%` }}
                aria-hidden="true"
              />
              <span
                className="desemp-graf-ponto"
                style={{
                  left: `${views.xs[ativo]}%`,
                  top: `${views.ys[ativo]}%`
                }}
                aria-hidden="true"
              />
              <div
                className="desemp-graf-dica"
                data-lado={(views.xs[ativo] ?? 0) > 50 ? 'esq' : 'dir'}
                style={{ left: `${views.xs[ativo]}%` }}
              >
                <b>{diaLongo(dia.date)}</b>
                Aberturas: <b>{dia.views}</b>
                <br />
                WhatsApp, rota e telefone: <b>{dia.actions}</b>
              </div>
            </>
          ) : null}
        </div>

        <span />
        <div className="desemp-graf-x" aria-hidden="true">
          {tickIndexes(count).map((index, posicao) => (
            <span
              key={index}
              data-celular={posicao % 2 ? 'nao' : undefined}
              data-borda={
                count > 1 && index === 0
                  ? 'ini'
                  : count > 1 && index === count - 1
                    ? 'fim'
                    : undefined
              }
              style={{ left: `${views.xs[index]}%` }}
            >
              {diaCurto(dias[index]?.date ?? '')}
            </span>
          ))}
        </div>
      </div>

      <p className="desemp-ativ-legenda">
        <span aria-hidden="true" />
        Em verde, os dias em que o número subiu.
      </p>
    </Card>
  )
}

/* ─── Cards ─── */

function EntregaElite({
  data,
  comparar
}: {
  data: AnalyticsOverviewData
  comparar: string | null
}) {
  if (data.classicExposures === null || data.classicClicks === null) {
    return null
  }
  const ctr =
    data.classicExposures > 0
      ? `${((data.classicClicks / data.classicExposures) * 100).toFixed(1).replace('.', ',')}%`
      : '—'
  const expVar = variacaoPct(data.classicExposuresChange)
  const cliVar = variacaoPct(data.classicClicksChange)
  return (
    <Card className="desemp-card">
      <TituloCard metrica="classicPlacement" selo="Elite" />
      <p className="desemp-sub">
        Quantas vezes seu bar apareceu na posição garantida e quantas pessoas
        abriram o perfil a partir dessa posição.
      </p>
      <dl className="desemp-cols" data-cols="3">
        {[
          ['Exposições', data.classicExposures.toLocaleString('pt-BR')],
          ['Cliques', data.classicClicks.toLocaleString('pt-BR')],
          ['CTR', ctr]
        ].map(([rotulo, valor]) => (
          <div key={rotulo}>
            <dt>{rotulo}</dt>
            <dd>
              <Marca tamanho={30}>{valor ?? ''}</Marca>
            </dd>
          </div>
        ))}
      </dl>
      {comparar && expVar && cliVar ? (
        <p className="desemp-var">
          Exposições <Variacao texto={expVar} /> · Cliques{' '}
          <Variacao texto={cliVar} /> vs {comparar}
        </p>
      ) : null}
    </Card>
  )
}

function QuemFoi({
  gerados,
  validados
}: {
  gerados: number
  validados: number
}) {
  return (
    <Card className="desemp-card">
      <TituloCard metrica="codes" />
      {gerados > 0 ? (
        <p className="desemp-sub">
          {Math.round((validados / gerados) * 100)}% de quem pegou o código
          chegou ao bar.
        </p>
      ) : null}
      <dl className="desemp-cols" data-cols="2">
        <div>
          <dt>Códigos gerados</dt>
          <dd>
            <Marca tamanho={30}>{gerados.toLocaleString('pt-BR')}</Marca>
          </dd>
        </div>
        <div>
          <dt>Validados no balcão</dt>
          <dd>
            <Marca tamanho={30}>{validados.toLocaleString('pt-BR')}</Marca>
          </dd>
        </div>
      </dl>
      <Progresso
        valor={validados}
        max={gerados}
        cor="var(--painel-acid)"
        altura={8}
        className="desemp-quemfoi-barra"
      />
      <p className="desemp-nota">
        Quem marcou “Vou assistir aqui” e os códigos validados. Não se somam a
        Interesse nem entram na taxa.
      </p>
    </Card>
  )
}

function ComoTeProcuraram({ data }: { data: AnalyticsOverviewData }) {
  const canais = [
    { rotulo: 'WhatsApp', n: data.whatsappOpened },
    { rotulo: 'Rota', n: data.directionsOpened },
    { rotulo: 'Telefone', n: data.phoneClicked }
  ]
  const total = canais.reduce((s, c) => s + (c.n ?? 0), 0)
  const travado = canais.some((c) => c.n === null)
  const principal = travado ? null : getMainAction(data)
  return (
    <Card className="desemp-card">
      <TituloCard metrica="channels" />
      {principal && principal !== '—' ? (
        <p className="desemp-mais">
          <Icone nome="check" tamanho={14} acento="var(--painel-ink)" />
          Mais usado: {principal}
        </p>
      ) : null}
      <ul className="desemp-canais">
        {canais.map((canal) => {
          const pct =
            canal.n !== null && total > 0 ? (canal.n / total) * 100 : 0
          return (
            <li key={canal.rotulo}>
              <div>
                <span>{canal.rotulo}</span>
                <b>
                  {formatAnalyticsValue(canal.n)}
                  {canal.n !== null ? (
                    <small> ({pct.toFixed(0)}%)</small>
                  ) : null}
                </b>
              </div>
              <span className="desemp-canal-trilho" aria-hidden="true">
                <span
                  data-lider={canal.rotulo === principal || undefined}
                  style={{ width: `${pct}%` }}
                />
              </span>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

function ComparadoAnterior({
  data,
  comparar
}: {
  data: AnalyticsOverviewData
  comparar: string
}) {
  const temHistorico = [
    data.phoneClickedPrev,
    data.whatsappOpenedPrev,
    data.directionsOpenedPrev,
    data.profileViewsPrev
  ].some((prev) => prev !== null && prev > 0)
  const linhas = [
    ['Aberturas', data.profileViews, data.profileViewsChange],
    ['WhatsApp', data.whatsappOpened, data.whatsappOpenedChange],
    ['Rota', data.directionsOpened, data.directionsOpenedChange],
    ['Telefone', data.phoneClicked, data.phoneClickedChange]
  ] as const
  return (
    <Card className="desemp-card">
      <TituloCard metrica="periodComparison" />
      {temHistorico ? (
        <dl className="desemp-cols" data-cols="2">
          {linhas.map(([rotulo, valor, variacao]) => {
            const texto = variacaoPct(variacao)
            return (
              <div key={rotulo}>
                <dt>{rotulo}</dt>
                <dd>
                  <span
                    className="desemp-comp-num"
                    data-travado={valor === null || undefined}
                  >
                    {formatAnalyticsValue(valor)}
                  </span>
                  {texto ? <Variacao texto={texto} /> : null}
                </dd>
              </div>
            )
          })}
        </dl>
      ) : (
        <p className="desemp-sub">
          Ainda não há dados de {comparar}. A comparação aparece assim que
          houver histórico suficiente.
        </p>
      )}
    </Card>
  )
}

/** Os três jogos que mais puxaram público, com o link para a lista inteira. */
function ResumoDosJogos({ jogos }: { jogos: EventAnalyticsRow[] | undefined }) {
  const ordenados = jogos ? jogosPorPublico(jogos) : []
  return (
    <Card className="desemp-card">
      <TituloCard metrica="eventPerformance" />
      {!jogos ? (
        <Skeleton className="h-24 w-full bg-[var(--painel-sub)]" />
      ) : ordenados.length === 0 ? (
        <p className="desemp-sub">
          Os números aparecem quando torcedores chegarem ao seu bar pelos jogos
          que você cadastrou.
        </p>
      ) : (
        <>
          <p className="desemp-sub">
            Os três jogos que mais puxaram público no período.
          </p>
          <ol className="desemp-resumo">
            {ordenados.slice(0, 3).map((jogo, i) => (
              <li key={jogo.eventId}>
                <b>
                  {jogo.eventName} <span>{diaDoJogo(jogo.startsAt)}</span>
                </b>
                <span className="desemp-resumo-viram">
                  {jogo.uniqueVisitors.toLocaleString('pt-BR')} viram
                </span>
                {jogo.interestedPeople !== null ? (
                  <>
                    <span className="desemp-resumo-int">
                      {i === 0 && jogo.interestedPeople > 0 ? (
                        <Marca tamanho={16}>
                          {`${jogo.interestedPeople} interessados`}
                        </Marca>
                      ) : (
                        <b>
                          {jogo.interestedPeople}{' '}
                          {jogo.interestedPeople === 1
                            ? 'interessado'
                            : 'interessados'}
                        </b>
                      )}
                    </span>
                    <span className="desemp-resumo-taxa">
                      {formatInterestRate(
                        jogo.interestedPeople,
                        jogo.uniqueVisitors
                      ).replace('.', ',')}
                    </span>
                  </>
                ) : null}
              </li>
            ))}
          </ol>
          <Link
            to="/admin/jogos"
            search={{ passados: 1 }}
            className="desemp-link"
          >
            {ordenados.length === 1
              ? 'Ver o jogo'
              : `Ver os ${ordenados.length} jogos`}{' '}
            em Jogos · Passados →
          </Link>
        </>
      )}
    </Card>
  )
}

/* ─── Página ─── */

function Carregando() {
  return (
    <div role="status" aria-busy="true" className="desemp-carregando">
      <span className="sr-only">Carregando o desempenho do bar…</span>
      <div className="desemp-kpis">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-40 bg-[var(--painel-sub)]" />
        ))}
      </div>
      <Skeleton className="h-96 bg-[var(--painel-sub)]" />
    </div>
  )
}

/**
 * Desempenho (telas 1x/1y): o analytics do bar no período, com os três
 * números, a atividade diária, a entrega Elite nos clássicos, quem foi pela
 * Onside, os canais, a comparação com o período anterior e o resumo de como
 * cada jogo foi. O que cada plano vê vem do servidor (o que não vê vem nulo).
 */
export function Desempenho() {
  const trpc = useTRPC()
  const [periodo, escolher] = usePeriodoDesempenho()
  const { seg, form } = useSeletorPeriodo(periodo, escolher)
  const { data: subscription, isFetched: assinaturaLida } = useMySubscription()
  const entitlements = useMyAnalyticsEntitlements()
  const overview = useDesempenho(periodo.range)
  const jogos = useQuery({
    ...trpc.commercialAnalytics.getMyEventAnalytics.queryOptions(periodo.range),
    meta: { errorToast: false }
  })

  const data = overview.data
  // "Tudo" não tem período anterior (WEB-263).
  const comparar =
    data && periodo.preset !== 'all'
      ? formatComparisonPeriod(data.from, data.to)
      : null
  const plano = data
    ? assinaturaLida && !subscription
      ? 'Sem plano'
      : `Plano ${getPlan(data.plan).name}`
    : null
  const codigos =
    entitlements.data?.canViewReservations && jogos.data
      ? codigosDoPeriodo(jogos.data.events)
      : null

  return (
    <div className="desemp">
      <CabecalhoPagina
        titulo="Desempenho"
        kicker={
          <>
            {rotuloPeriodo(periodo.range)}
            {plano ? ` · ${plano}` : null}
          </>
        }
        acoes={seg}
      />
      {form}

      {overview.isPending ? (
        <Carregando />
      ) : overview.isError || !data ? (
        <QueryError
          message={getUserFacingMessage(
            overview.error,
            'Não foi possível carregar as métricas. Tente novamente.'
          )}
          retryable={isRetryableError(overview.error)}
          onRetry={() => void overview.refetch()}
        />
      ) : (
        <>
          {data.limitations.includes(
            'distinct_counts_are_daily_sums_after_retention'
          ) ? (
            <p className="desemp-nota" role="note">
              Visitantes e interessados de dias já consolidados são somados por
              dia. A mesma pessoa em dias diferentes pode aparecer mais de uma
              vez nessa janela.
            </p>
          ) : null}
          <Numeros data={data} comparar={comparar} />
          <AtividadeDiaria
            dias={serieDiaria(data)}
            aberturasVar={variacaoPct(data.profileViewsChange)}
            acoesVar={variacaoPct(data.highIntentActionsChange)}
            comparar={comparar}
          />
          <div className="desemp-grid">
            <EntregaElite data={data} comparar={comparar} />
            {codigos ? <QuemFoi {...codigos} /> : null}
            <ComoTeProcuraram data={data} />
            {comparar ? (
              <ComparadoAnterior data={data} comparar={comparar} />
            ) : null}
          </div>
          {jogos.isError ? (
            <QueryError
              message={getUserFacingMessage(
                jogos.error,
                'Não foi possível carregar o desempenho dos jogos. Tente novamente.'
              )}
              retryable={isRetryableError(jogos.error)}
              onRetry={() => void jogos.refetch()}
            />
          ) : (
            <ResumoDosJogos jogos={jogos.data?.events} />
          )}
        </>
      )}
    </div>
  )
}
