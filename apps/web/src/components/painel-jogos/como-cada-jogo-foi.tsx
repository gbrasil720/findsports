import type {
  AnalyticsComparisonMode,
  ComparisonMetric,
  EventComparisonTarget
} from '@findsports_oficial/api/lib/commercial-analytics/types'
import { Skeleton } from '@findsports_oficial/ui/components/skeleton'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import {
  type EventAnalyticsRow,
  type EventComparisonData,
  formatAnalyticsValue,
  formatInterestRate,
  getMainAction,
  LOCKED_ANALYTICS_VALUE
} from '@/components/admin/admin-model'
import { useMyAnalyticsEntitlements } from '@/components/admin/admin-queries'
import type { AnalyticsDateRange } from '@/components/admin/analytics-period'
import { Marca } from '@/components/admin/desempenho'
import {
  diaDoJogo,
  jogosPorPublico,
  melhorJogo,
  rotuloPeriodo
} from '@/components/admin/desempenho-contas'
import { MetricHint } from '@/components/admin/metric-hint'
import { QueryError } from '@/components/admin/query-error'
import { getUserFacingMessage, isRetryableError } from '@/lib/user-facing-error'
import { useTRPC } from '@/utils/trpc'
import { Badge, Card, Chip, Icone } from '../painel'

const ROTULO_METRICA: Record<ComparisonMetric, string> = {
  uniqueVisitors: 'Visitantes',
  profileViews: 'Aberturas',
  directionsOpened: 'Rota',
  phoneClicked: 'Telefone',
  whatsappOpened: 'WhatsApp'
}

/** Colunas da comparação, na ordem do design. */
const COLUNAS: [ComparisonMetric, string][] = [
  ['uniqueVisitors', 'Vis.'],
  ['profileViews', 'Abert.'],
  ['directionsOpened', 'Rota'],
  ['phoneClicked', 'Tel.'],
  ['whatsappOpened', 'Whats']
]

const DIA_DA_SEMANA = [
  '',
  'segunda-feira',
  'terça-feira',
  'quarta-feira',
  'quinta-feira',
  'sexta-feira',
  'sábado',
  'domingo'
]

const numero = (valor: number | null) =>
  valor === null
    ? '—'
    : valor.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
const pct = (valor: number | null) =>
  valor === null ? '—' : `${valor.toFixed(1).replace('.', ',')}%`
const taxa = (jogo: EventAnalyticsRow) =>
  jogo.interestedPeople === null
    ? '—'
    : formatInterestRate(jogo.interestedPeople, jogo.uniqueVisitors).replace(
        '.',
        ','
      )

/* ─── Tabela ─── */

function LinhaJogo({
  jogo,
  melhor,
  codigos,
  aberto,
  onAlternar
}: {
  jogo: EventAnalyticsRow
  melhor: boolean
  codigos: boolean
  aberto: boolean
  onAlternar: () => void
}) {
  const painel = `passados-${jogo.eventId}`
  return (
    <li className="passados-item">
      <button
        type="button"
        className="passados-linha"
        aria-expanded={aberto}
        aria-controls={painel}
        onClick={onAlternar}
      >
        <span className="passados-nome">
          <b>{jogo.eventName}</b>
          <span>{diaDoJogo(jogo.startsAt)}</span>
        </span>
        {/* O cabeçalho é só alinhamento: cada número leva o próprio rótulo. */}
        <span className="passados-col-viram">
          <span className="sr-only">Viram: </span>
          {jogo.uniqueVisitors.toLocaleString('pt-BR')}
        </span>
        <span className="passados-int">
          <span className="sr-only">Interesse: </span>
          {jogo.interestedPeople === null ? (
            <span title={LOCKED_ANALYTICS_VALUE}>—</span>
          ) : melhor ? (
            <Marca tamanho={15}>{String(jogo.interestedPeople)}</Marca>
          ) : (
            jogo.interestedPeople
          )}
        </span>
        <span className="passados-taxa passados-col-taxa">
          <span className="sr-only">Taxa: </span>
          {taxa(jogo)}
        </span>
        {codigos ? (
          <>
            <span className="passados-cod passados-col-cod">
              <span className="sr-only">Códigos: </span>
              {numero(jogo.reservedPeople)}
            </span>
            <span className="passados-col-cod">
              <span className="sr-only">Validados: </span>
              {numero(jogo.arrivals)}
            </span>
          </>
        ) : null}
        <Icone
          nome="down"
          tamanho={12}
          acento="var(--painel-muted)"
          className="passados-seta painel-muted"
        />
      </button>
      {aberto ? (
        <div id={painel} className="passados-aberto">
          <dl className="passados-canais">
            {[
              ['WhatsApp', formatAnalyticsValue(jogo.whatsappOpened)],
              ['Rota', formatAnalyticsValue(jogo.directionsOpened)],
              ['Telefone', formatAnalyticsValue(jogo.phoneClicked)],
              ['Mais usado', getMainAction(jogo)],
              ['Aberturas', jogo.profileViews.toLocaleString('pt-BR')]
            ].map(([rotulo, valor]) => (
              <div key={rotulo}>
                <dt>{rotulo}</dt>
                <dd>{valor}</dd>
              </div>
            ))}
          </dl>
          {codigos ? (
            <dl className="passados-codigos">
              <div>
                <dt>Códigos</dt>
                <dd>{numero(jogo.reservedPeople)}</dd>
              </div>
              <div>
                <dt>Validados</dt>
                <dd>{numero(jogo.arrivals)}</dd>
              </div>
              <p>
                Quem marcou “Vou assistir aqui” e os códigos validados no
                balcão. Não se somam a Interesse.
              </p>
            </dl>
          ) : null}
        </div>
      ) : null}
    </li>
  )
}

/* ─── Comparar jogos ─── */

function ResultadoComparacao({
  comparacao
}: {
  comparacao: EventComparisonData
}) {
  if (comparacao.status === 'empty') {
    return (
      <p className="desemp-nota comparar-bloco">
        {comparacao.emptyReason === 'no_baseline'
          ? 'Cadastre outro jogo com dados para calcular a média do bar.'
          : comparacao.emptyReason === 'not_enough_games'
            ? 'Selecione pelo menos dois jogos com dados para comparar.'
            : 'Ainda não há dados elegíveis para esta comparação.'}
      </p>
    )
  }
  const linhas = comparacao.benchmark
    ? [...comparacao.events, comparacao.benchmark]
    : comparacao.events
  const historico = comparacao.benchmarks.filter((b) => b.scope === 'history')
  return (
    <>
      <div className="comparar-bloco">
        <h3>Comparação calculada</h3>
        <p>
          Volumes brutos; os insights também usam a taxa por hora de cada jogo.
        </p>
        <table className="comparar-tabela">
          <colgroup>
            <col />
            {COLUNAS.map(([metrica]) => (
              <col key={metrica} style={{ width: 39 }} />
            ))}
            <col style={{ width: 51 }} />
          </colgroup>
          <thead>
            <tr>
              <th scope="col">Jogo</th>
              {COLUNAS.map(([metrica, curto]) => (
                <th key={metrica} scope="col" title={ROTULO_METRICA[metrica]}>
                  {curto}
                </th>
              ))}
              <th scope="col" title="Conversão">
                Conv.
              </th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((linha) => (
              <tr key={linha.eventId}>
                <th scope="row" title={linha.eventName}>
                  {linha.eventName}
                </th>
                {COLUNAS.map(([metrica]) => (
                  <td key={metrica}>{numero(linha[metrica])}</td>
                ))}
                <td>{pct(linha.conversionRate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <h3 style={{ marginTop: 16 }}>Ranking por conversão</h3>
        <ol className="comparar-ranking">
          {comparacao.ranking.map((item) => (
            <li key={item.eventId}>
              <span>
                {item.rank}. {item.eventName}
              </span>
              <b>{pct(item.conversionRate)}</b>
            </li>
          ))}
        </ol>
      </div>
      {comparacao.mode === 'advanced' ? (
        <div className="comparar-bloco">
          {comparacao.insights.length > 0 ? (
            <>
              <h3>Variações anômalas</h3>
              <ul className="comparar-insights">
                {comparacao.insights.map((insight) => (
                  <li key={`${insight.eventId}-${insight.metric}`}>
                    <Icone nome="spark" tamanho={16} />
                    <p className="m-0">
                      <b>{insight.eventName}:</b>{' '}
                      <span>
                        {ROTULO_METRICA[insight.metric]} {numero(insight.value)}{' '}
                        vs {numero(insight.baseline)} na{' '}
                        {DIA_DA_SEMANA[insight.weekday] ?? 'semana'} (
                        {pct(insight.changePercent)})
                      </span>
                    </p>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          <h3 style={{ marginTop: 8 }}>Benchmark histórico</h3>
          <p className="comparar-bench">
            {historico.length > 0
              ? historico
                  .map(
                    (b) =>
                      `${ROTULO_METRICA[b.metric]} ${numero(b.current)} vs histórico ${numero(b.baseline)} (${pct(b.changePercent)})`
                  )
                  .join(' · ')
              : 'Ainda não há histórico suficiente para formar um benchmark.'}
          </p>
        </div>
      ) : null}
    </>
  )
}

/**
 * "Comparar jogos" (Pro e Elite): entre jogos escolhidos ou um jogo contra a
 * média do bar. A conta é do servidor (`comparisonTarget`).
 */
function CompararJogos({
  jogos,
  modo,
  range
}: {
  jogos: EventAnalyticsRow[]
  modo: Exclude<AnalyticsComparisonMode, 'previous_period'>
  range: AnalyticsDateRange
}) {
  const trpc = useTRPC()
  const [escolha, setEscolha] = useState<EventComparisonTarget | null>(null)
  // Começa com os três que mais puxaram público, como o seletor antigo.
  const alvo: EventComparisonTarget | null =
    escolha ??
    (jogos.length
      ? { type: 'events', eventIds: jogos.slice(0, 3).map((j) => j.eventId) }
      : null)
  const comparacao = useQuery({
    ...trpc.commercialAnalytics.getMyEventAnalytics.queryOptions({
      ...range,
      comparisonTarget: alvo ?? undefined
    }),
    enabled: !!alvo,
    meta: { errorToast: false }
  })
  const contraMedia = alvo?.type === 'event_to_bar'
  const escolhidos =
    alvo?.type === 'events'
      ? alvo.eventIds
      : alvo?.type === 'event_to_bar'
        ? [alvo.eventId]
        : []

  const tocar = (id: string) => {
    if (contraMedia) return setEscolha({ type: 'event_to_bar', eventId: id })
    const ids = escolhidos.includes(id)
      ? escolhidos.filter((x) => x !== id)
      : [...escolhidos, id]
    setEscolha(ids.length ? { type: 'events', eventIds: ids } : null)
  }
  const trocarModo = (media: boolean) => {
    const primeiro = escolhidos[0] ?? jogos[0]?.eventId
    if (media) {
      if (primeiro) setEscolha({ type: 'event_to_bar', eventId: primeiro })
    } else {
      const ids = escolhidos.length
        ? escolhidos
        : jogos.slice(0, 2).map((j) => j.eventId)
      if (ids.length) setEscolha({ type: 'events', eventIds: ids })
    }
  }

  return (
    <Card className="comparar" role="region" aria-labelledby="comparar-titulo">
      <div className="comparar-cab">
        <h2 id="comparar-titulo">Comparar jogos</h2>
        <Badge tipo="acid">{modo === 'advanced' ? 'Elite' : 'Pro'}</Badge>
      </div>
      <fieldset className="comparar-modo">
        <legend className="sr-only">Tipo de comparação</legend>
        <label>
          <input
            type="radio"
            name="comparar-modo"
            checked={!contraMedia}
            onChange={() => trocarModo(false)}
          />
          Entre jogos
        </label>
        <label>
          <input
            type="radio"
            name="comparar-modo"
            checked={contraMedia}
            onChange={() => trocarModo(true)}
          />
          Jogo contra média do bar
        </label>
      </fieldset>
      <fieldset className="comparar-jogos">
        <legend className="sr-only">
          {contraMedia ? 'Jogo alvo' : 'Jogos comparados'}
        </legend>
        {jogos.map((jogo) => (
          <Chip
            key={jogo.eventId}
            altura={30}
            ativo={escolhidos.includes(jogo.eventId)}
            onClick={() => tocar(jogo.eventId)}
          >
            {jogo.eventName}
          </Chip>
        ))}
      </fieldset>
      <div aria-live="polite">
        {!contraMedia && escolhidos.length < 2 ? (
          <p className="desemp-nota" style={{ marginTop: 10 }}>
            Selecione pelo menos dois jogos com dados.
          </p>
        ) : null}
        {comparacao.isFetching ? (
          <p className="desemp-nota" style={{ marginTop: 10 }}>
            Calculando…
          </p>
        ) : null}
      </div>
      {comparacao.isError ? (
        <p className="desemp-erro comparar-bloco" role="alert">
          {getUserFacingMessage(
            comparacao.error,
            'Não foi possível calcular a comparação.'
          )}
        </p>
      ) : comparacao.data?.comparison ? (
        <ResultadoComparacao comparacao={comparacao.data.comparison} />
      ) : null}
    </Card>
  )
}

/* ─── A aba ─── */

/**
 * Jogos · Passados (telas 1z/1aa): "Como cada jogo foi" no período do
 * Desempenho, o melhor jogo, a tabela com a linha que abre canais e códigos e,
 * no Pro e no Elite, "Comparar jogos".
 */
/**
 * `encerrados`: os jogos que já acabaram. O período do Desempenho vai até
 * hoje e traz o jogo de hoje à noite, que ainda não é passado.
 */
export function ComoCadaJogoFoi({
  range,
  encerrados
}: {
  range: AnalyticsDateRange
  encerrados: ReadonlySet<string>
}) {
  const trpc = useTRPC()
  const entitlements = useMyAnalyticsEntitlements()
  const consulta = useQuery({
    ...trpc.commercialAnalytics.getMyEventAnalytics.queryOptions(range),
    meta: { errorToast: false }
  })
  const [aberto, setAberto] = useState<string | null>(null)

  if (consulta.isPending || entitlements.isPending) {
    return (
      <div role="status" aria-busy="true" className="passados-esq">
        <span className="sr-only">Carregando como cada jogo foi…</span>
        <Skeleton className="h-12 w-72 bg-[var(--painel-sub)]" />
        <Skeleton className="h-64 w-full bg-[var(--painel-sub)]" />
      </div>
    )
  }
  if (consulta.isError) {
    return (
      <QueryError
        message={getUserFacingMessage(
          consulta.error,
          'Não foi possível carregar o desempenho dos jogos. Tente novamente.'
        )}
        retryable={isRetryableError(consulta.error)}
        onRetry={() => void consulta.refetch()}
      />
    )
  }

  const jogos = jogosPorPublico(
    consulta.data.events.filter((jogo) => encerrados.has(jogo.eventId))
  )
  const melhor = melhorJogo(jogos)
  // O servidor manda `null` fora do Elite.
  const codigos = jogos.some((jogo) => jogo.reservedPeople !== null)
  const modo = entitlements.data?.comparison
  const compara = modo && modo !== 'previous_period' && jogos.length > 0

  return (
    <div className="passados" data-sem-comparar={compara ? undefined : true}>
      <section className="passados-esq" aria-labelledby="passados-titulo">
        <div className="passados-cab">
          <h2
            id="passados-titulo"
            className="painel-disp"
            style={{ ['--painel-disp-size' as string]: '34px' }}
          >
            Como cada jogo foi
          </h2>
          <MetricHint metric="eventPerformance" />
          <span>{rotuloPeriodo(range)}</span>
        </div>
        {melhor ? (
          <p className="passados-melhor">
            <Icone nome="check" tamanho={15} acento="var(--painel-ink)" />
            <span>
              Melhor jogo: <b>{melhor.eventName}</b> ({melhor.interestedPeople}{' '}
              {melhor.interestedPeople === 1 ? 'interessado' : 'interessados'})
            </span>
          </p>
        ) : null}
        {jogos.length === 0 ? (
          <Card>
            <p className="desemp-sub m-0">
              Os números aparecem quando torcedores chegarem ao seu bar pelos
              jogos que você cadastrou.
            </p>
          </Card>
        ) : (
          <Card className="passados-tabela" data-codigos={codigos || undefined}>
            <div className="passados-colunas" aria-hidden="true">
              <span />
              <span className="passados-col-viram">Viram</span>
              <span>Interesse</span>
              <span className="passados-col-taxa">Taxa</span>
              {codigos ? (
                <>
                  <span className="passados-col-cod">Códigos</span>
                  <span className="passados-col-cod">Validados</span>
                </>
              ) : null}
              <span />
            </div>
            <ul className="m-0 list-none p-0" aria-label="Jogos do período">
              {jogos.map((jogo) => (
                <LinhaJogo
                  key={jogo.eventId}
                  jogo={jogo}
                  melhor={jogo.eventId === melhor?.eventId}
                  codigos={codigos}
                  aberto={aberto === jogo.eventId}
                  onAlternar={() =>
                    setAberto((atual) =>
                      atual === jogo.eventId ? null : jogo.eventId
                    )
                  }
                />
              ))}
            </ul>
          </Card>
        )}
      </section>
      {compara ? (
        <CompararJogos jogos={jogos} modo={modo} range={range} />
      ) : null}
    </div>
  )
}
