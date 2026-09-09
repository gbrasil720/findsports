import type {
  AnalyticsComparisonMode,
  ComparisonMetric,
  EventComparisonTarget
} from '@findsports_oficial/api/lib/commercial-analytics/types'
import { useState } from 'react'
import AlertCircle from 'reicon-react/icons/AlertCircle'
import Check from 'reicon-react/icons/Check'
import ChevronDown from 'reicon-react/icons/ChevronDown'
import {
  type EventAnalyticsRow,
  type EventAnalyticsState,
  type EventComparisonData,
  formatAnalyticsValue,
  formatRate,
  getMainAction,
  sumAnalyticsActions
} from './admin-model'
import { formatAnalyticsPeriod } from './analytics-period'
import { getMetric } from './metric-glossary'
import { MetricHint } from './metric-hint'

/** Título da seção com o ⓘ do glossário ao lado. */
function PerformanceHeading() {
  return (
    <h3 className="onside-heading mb-3">
      {getMetric('eventPerformance').label}
      <MetricHint metric="eventPerformance" />
    </h3>
  )
}

function formatEventDate(startsAt: string): string {
  const d = new Date(startsAt)
  return d.toLocaleDateString('pt-BR', {
    day: 'numeric',
    month: 'short'
  })
}

const COMPARISON_METRIC_LABELS: Record<ComparisonMetric, string> = {
  uniqueVisitors: 'Visitantes',
  profileViews: 'Aberturas',
  directionsOpened: 'Rota',
  phoneClicked: 'Telefone',
  whatsappOpened: 'WhatsApp'
}

const WEEKDAY_LABELS = [
  '',
  'segunda-feira',
  'terça-feira',
  'quarta-feira',
  'quinta-feira',
  'sexta-feira',
  'sábado',
  'domingo'
]

function formatComparisonNumber(value: number | null): string {
  return value === null
    ? formatAnalyticsValue(null)
    : value.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
}

function formatConversionRate(value: number | null): string {
  return value === null ? '—' : `${value.toFixed(1)}%`
}

function ComparisonControls({
  items,
  mode,
  target,
  loading,
  onChange
}: {
  items: EventAnalyticsRow[]
  mode?: AnalyticsComparisonMode
  target?: EventComparisonTarget
  loading?: boolean
  onChange?: (target: EventComparisonTarget | undefined) => void
}) {
  if (!mode || mode === 'previous_period' || !onChange) return null

  const selectedIds = target?.type === 'events' ? target.eventIds : []
  const isBarAverage = target?.type === 'event_to_bar'

  const chooseEvents = () => {
    const ids = selectedIds.length
      ? selectedIds
      : items.slice(0, 2).map((item) => item.eventId)
    if (ids.length > 0) onChange({ type: 'events', eventIds: ids })
  }

  const toggleEvent = (eventId: string) => {
    const next = selectedIds.includes(eventId)
      ? selectedIds.filter((id) => id !== eventId)
      : [...selectedIds, eventId]
    onChange(next.length > 0 ? { type: 'events', eventIds: next } : undefined)
  }

  return (
    <fieldset className="mb-4 border border-[var(--onside-line)] p-3">
      <legend className="px-1 font-[family-name:var(--onside-mono)] text-[10px] text-[var(--onside-ink)] uppercase tracking-[0.1em] opacity-60">
        Comparação disponível no plano {mode === 'advanced' ? 'Elite' : 'Pro'}
      </legend>

      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="event-comparison-mode"
            checked={!isBarAverage}
            onChange={chooseEvents}
          />
          Entre jogos
        </label>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="event-comparison-mode"
            checked={isBarAverage}
            onChange={() => {
              const eventId =
                target?.type === 'event_to_bar'
                  ? target.eventId
                  : items[0]?.eventId
              if (eventId) onChange({ type: 'event_to_bar', eventId })
            }}
          />
          Jogo contra média do bar
        </label>
        {loading && (
          <span className="text-xs text-[var(--onside-muted)]">
            Calculando…
          </span>
        )}
      </div>

      {!isBarAverage && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {items.map((item) => (
            <label
              key={item.eventId}
              className="flex min-w-0 items-center gap-2 text-sm"
            >
              <input
                type="checkbox"
                checked={selectedIds.includes(item.eventId)}
                onChange={() => toggleEvent(item.eventId)}
              />
              <span className="truncate">{item.eventName}</span>
            </label>
          ))}
        </div>
      )}

      {isBarAverage && (
        <label className="mt-3 block max-w-md text-sm">
          <span className="mb-1 block text-xs text-[var(--onside-muted)]">
            Jogo alvo
          </span>
          <select
            value={target.type === 'event_to_bar' ? target.eventId : ''}
            onChange={(event) => {
              if (event.currentTarget.value) {
                onChange({
                  type: 'event_to_bar',
                  eventId: event.currentTarget.value
                })
              }
            }}
            className="min-h-10 w-full border border-[var(--onside-line)] bg-[var(--onside-paper)] px-2 text-sm"
          >
            <option value="">Selecione um jogo</option>
            {items.map((item) => (
              <option key={item.eventId} value={item.eventId}>
                {item.eventName}
              </option>
            ))}
          </select>
        </label>
      )}

      {!isBarAverage && selectedIds.length < 2 && (
        <p className="mt-2 text-xs text-[var(--onside-muted)]">
          Selecione pelo menos dois jogos com dados.
        </p>
      )}
    </fieldset>
  )
}

function ComparisonTable({ comparison }: { comparison: EventComparisonData }) {
  const rows = comparison.benchmark
    ? [...comparison.events, comparison.benchmark]
    : comparison.events

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[620px] text-left text-xs">
        <thead className="border-[var(--onside-line)] border-b text-[var(--onside-muted)]">
          <tr>
            <th className="py-2 pr-3 font-normal">Jogo</th>
            {(
              [
                'uniqueVisitors',
                'profileViews',
                'directionsOpened',
                'phoneClicked',
                'whatsappOpened'
              ] as const
            ).map((metric) => (
              <th key={metric} className="px-2 py-2 text-right font-normal">
                {COMPARISON_METRIC_LABELS[metric]}
              </th>
            ))}
            <th className="py-2 pl-2 text-right font-normal">Conversão</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.eventId}
              className="border-[var(--onside-line)] border-b last:border-0"
            >
              <th
                className="max-w-44 truncate py-2 pr-3 font-medium"
                scope="row"
              >
                {row.eventName}
              </th>
              {(
                [
                  'uniqueVisitors',
                  'profileViews',
                  'directionsOpened',
                  'phoneClicked',
                  'whatsappOpened'
                ] as const
              ).map((metric) => (
                <td key={metric} className="px-2 py-2 text-right tabular-nums">
                  {formatComparisonNumber(row[metric])}
                </td>
              ))}
              <td className="py-2 pl-2 text-right font-medium tabular-nums">
                {formatConversionRate(row.conversionRate)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ComparisonResult({
  comparison,
  mode,
  loading
}: {
  comparison?: EventComparisonData
  mode?: AnalyticsComparisonMode
  loading?: boolean
}) {
  if (!mode || mode === 'previous_period') return null
  if (loading && !comparison) {
    return (
      <div className="onside-panel-acid mb-4 p-4 text-sm text-[var(--onside-muted)]">
        Calculando comparação com os dados do bar…
      </div>
    )
  }
  if (!comparison) return null

  if (comparison.status === 'empty') {
    const message =
      comparison.emptyReason === 'no_baseline'
        ? 'Cadastre outro jogo com dados para calcular a média do bar.'
        : comparison.emptyReason === 'not_enough_games'
          ? 'Selecione pelo menos dois jogos com dados para comparar.'
          : 'Ainda não há dados elegíveis para esta comparação.'
    return (
      <div className="onside-panel-acid mb-4 p-4 text-sm text-[var(--onside-muted)]">
        {message}
      </div>
    )
  }

  const ranking = comparison.ranking
  const historyBenchmarks = comparison.benchmarks.filter(
    (benchmark) => benchmark.scope === 'history'
  )

  return (
    <div className="onside-panel-acid mb-4 space-y-4 p-4">
      <div>
        <h4 className="onside-heading mb-1">Comparação calculada</h4>
        <p className="text-xs text-[var(--onside-muted)]">
          Os volumes são brutos; os insights também usam a taxa por hora da
          janela efetiva de cada jogo.
        </p>
      </div>

      <ComparisonTable comparison={comparison} />

      <div className="grid gap-3 text-xs sm:grid-cols-2">
        {comparison.events.map((row) => (
          <div key={`${row.eventId}-normalized`}>
            <p className="mb-1 font-medium">{row.eventName} — por hora</p>
            <p className="text-[var(--onside-muted)]">
              Visitantes {formatComparisonNumber(row.normalized.uniqueVisitors)}
              {' · '}Aberturas{' '}
              {formatComparisonNumber(row.normalized.profileViews)}
              {' · '}Ações{' '}
              {formatComparisonNumber(
                sumAnalyticsActions({
                  directionsOpened: row.normalized.directionsOpened,
                  phoneClicked: row.normalized.phoneClicked,
                  whatsappOpened: row.normalized.whatsappOpened
                })
              )}
            </p>
          </div>
        ))}
      </div>

      <div>
        <p className="mb-2 font-medium text-sm">Ranking por conversão</p>
        <ol className="space-y-1 text-sm">
          {ranking.map((item) => (
            <li key={item.eventId} className="flex justify-between gap-3">
              <span>
                {item.rank}. {item.eventName}
              </span>
              <span className="font-medium tabular-nums">
                {formatConversionRate(item.conversionRate)}
              </span>
            </li>
          ))}
        </ol>
      </div>

      {comparison.mode === 'advanced' && (
        <div className="space-y-3 border-[var(--onside-line)] border-t pt-3">
          <div>
            <p className="mb-2 font-medium text-sm">Benchmark histórico</p>
            {historyBenchmarks.length > 0 ? (
              <div className="grid gap-2 text-xs sm:grid-cols-2">
                {historyBenchmarks.map((benchmark) => (
                  <p key={`history-${benchmark.metric}`}>
                    {COMPARISON_METRIC_LABELS[benchmark.metric]}:{' '}
                    <span className="font-medium tabular-nums">
                      {formatComparisonNumber(benchmark.current)}
                    </span>{' '}
                    vs histórico{' '}
                    <span className="font-medium tabular-nums">
                      {formatComparisonNumber(benchmark.baseline)}
                    </span>{' '}
                    ({formatConversionRate(benchmark.changePercent)})
                  </p>
                ))}
              </div>
            ) : (
              <p className="text-xs text-[var(--onside-muted)]">
                Ainda não há histórico suficiente para formar um benchmark.
              </p>
            )}
          </div>

          {comparison.insights.length > 0 && (
            <div>
              <p className="mb-2 font-medium text-sm">Variações anômalas</p>
              <ul className="space-y-1 text-xs">
                {comparison.insights.map((insight) => (
                  <li key={`${insight.eventId}-${insight.metric}`}>
                    {insight.eventName}:{' '}
                    {COMPARISON_METRIC_LABELS[insight.metric]}{' '}
                    <span className="font-medium tabular-nums">
                      {formatComparisonNumber(insight.value)}
                    </span>{' '}
                    vs {formatComparisonNumber(insight.baseline)} na{' '}
                    {WEEKDAY_LABELS[insight.weekday] ?? 'semana'} (
                    {formatConversionRate(insight.changePercent)})
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Skeleton                                                            */
/* ------------------------------------------------------------------ */

function PerformanceSkeleton() {
  return (
    <div className="onside-panel-acid p-4">
      <h3 className="onside-heading mb-3">
        {getMetric('eventPerformance').label}
      </h3>
      <div className="space-y-3">
        {[1, 2].map((i) => (
          <div
            key={i}
            className="h-12 w-full rounded-sm bg-[var(--onside-paper)] animate-pulse"
          />
        ))}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Error                                                               */
/* ------------------------------------------------------------------ */

function PerformanceError({
  message,
  onRetry
}: {
  message?: string
  onRetry: () => void
}) {
  return (
    <div className="onside-callout onside-callout-danger" role="alert">
      <AlertCircle
        size={20}
        color="currentColor"
        className="mt-0.5 shrink-0"
        aria-hidden="true"
      />
      <p className="flex-1">
        {message || 'Não foi possível carregar o desempenho dos jogos.'}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="onside-btn onside-btn-ink shrink-0"
      >
        Tentar novamente
      </button>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Event Row                                                           */
/* ------------------------------------------------------------------ */

/**
 * Trilha de colunas compartilhada pelo cabeçalho e pelas linhas — é o que
 * mantém os números alinhados sem repetir o rótulo em cada linha.
 *
 * No celular só sobra "Interesse": as outras duas colunas não cabem sem
 * espremer o nome do jogo, e o detalhe completo já está no painel expandido.
 */
const ROW_GRID =
  'grid grid-cols-[1.25rem_minmax(0,1fr)_4.25rem] items-center gap-x-3 sm:grid-cols-[1.25rem_minmax(0,1fr)_repeat(3,4.25rem)]'

function PerformanceColumns() {
  return (
    <div
      className={`${ROW_GRID} border-[var(--onside-line)] border-b pb-1.5 font-[family-name:var(--onside-mono)] text-[10px] text-[var(--onside-ink)] uppercase tracking-[0.1em] opacity-50`}
      aria-hidden="true"
    >
      <span />
      <span />
      <span className="hidden text-right sm:block">Aberturas</span>
      <span className="text-right">Interesse</span>
      <span className="hidden text-right sm:block">Taxa</span>
    </div>
  )
}

function EventPerformanceRow({ item }: { item: EventAnalyticsRow }) {
  const [expanded, setExpanded] = useState(false)
  const panelId = `event-performance-${item.eventId}`
  const intentActions = sumAnalyticsActions(item)

  return (
    <div className="border-b border-[var(--onside-line)] last:border-b-0">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className={`${ROW_GRID} w-full py-2.5 text-left transition-colors hover:bg-[var(--onside-paper)]/50`}
        aria-expanded={expanded}
        aria-controls={panelId}
      >
        <ChevronDown
          size={16}
          color="var(--onside-ink)"
          className={`transition-transform duration-[180ms] [transition-timing-function:var(--onside-ease-out)] ${expanded ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />

        <span className="flex min-w-0 items-baseline gap-2">
          <span className="truncate font-medium text-[var(--onside-ink)] text-sm">
            {item.eventName}
          </span>
          <span className="shrink-0 text-[var(--onside-ink)] text-xs opacity-60">
            {formatEventDate(item.startsAt)}
          </span>
        </span>

        {/* O cabeçalho é só alinhamento visual, então cada número carrega o
            próprio rótulo pra leitor de tela. */}
        <span className="hidden text-right font-medium text-[var(--onside-ink)] text-sm tabular-nums sm:block">
          <span className="sr-only">Aberturas: </span>
          {item.profileViews}
        </span>
        <span className="text-right font-medium text-[var(--onside-ink)] text-sm tabular-nums">
          <span className="sr-only">Interesse: </span>
          {formatAnalyticsValue(intentActions)}
        </span>
        <span className="hidden text-right font-medium text-[var(--onside-ink)] text-sm tabular-nums sm:block">
          <span className="sr-only">Taxa: </span>
          {intentActions === null
            ? formatAnalyticsValue(null)
            : formatRate(intentActions, item.profileViews)}
        </span>
      </button>

      {/* O painel de métricas abre instantaneamente: animar sua altura causa
          reflow e atrapalha a leitura de dados. */}
      <div
        id={panelId}
        aria-hidden={!expanded}
        className={`grid ${expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
      >
        <div className="overflow-hidden">
          <dl className="grid grid-cols-2 gap-x-3 gap-y-2 pb-3 pl-8 text-[var(--onside-ink)] text-sm opacity-80 sm:grid-cols-4">
            <div>
              <dt className="text-xs opacity-60">WhatsApp</dt>
              <dd className="font-medium tabular-nums">
                {formatAnalyticsValue(item.whatsappOpened)}
              </dd>
            </div>
            <div>
              <dt className="text-xs opacity-60">Rota</dt>
              <dd className="font-medium tabular-nums">
                {formatAnalyticsValue(item.directionsOpened)}
              </dd>
            </div>
            <div>
              <dt className="text-xs opacity-60">Telefone</dt>
              <dd className="font-medium tabular-nums">
                {formatAnalyticsValue(item.phoneClicked)}
              </dd>
            </div>
            <div>
              <dt className="text-xs opacity-60">Mais usado</dt>
              <dd className="font-medium">{getMainAction(item) ?? '—'}</dd>
            </div>
          </dl>

          {/* No celular as colunas de aberturas e taxa saem do cabeçalho;
              aqui elas reaparecem pra não sumir a informação. */}
          <dl className="grid grid-cols-2 gap-x-3 gap-y-2 pb-3 pl-8 text-[var(--onside-ink)] text-sm opacity-80 sm:hidden">
            <div>
              <dt className="text-xs opacity-60">Aberturas</dt>
              <dd className="font-medium tabular-nums">{item.profileViews}</dd>
            </div>
            <div>
              <dt className="text-xs opacity-60">Taxa</dt>
              <dd className="font-medium tabular-nums">
                {intentActions === null
                  ? formatAnalyticsValue(null)
                  : formatRate(intentActions, item.profileViews)}
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Main component                                                      */
/* ------------------------------------------------------------------ */

export function EventPerformance({
  eventAnalyticsState
}: {
  eventAnalyticsState: EventAnalyticsState
}) {
  if (eventAnalyticsState.status === 'loading') return <PerformanceSkeleton />
  if (eventAnalyticsState.status === 'error' && eventAnalyticsState.retry)
    return (
      <PerformanceError
        message={eventAnalyticsState.message}
        onRetry={eventAnalyticsState.retry}
      />
    )

  // Bloqueio real de plano — não é ausência de dados, então não pode cair no
  // estado vazio ("os números aparecem quando...") que esconderia o motivo.
  if (eventAnalyticsState.status === 'blocked') {
    return (
      <div className="onside-panel-acid p-4">
        <PerformanceHeading />
        <p className="text-sm text-[var(--onside-ink)] opacity-60">
          Seu plano não inclui analytics por jogo. Confira os planos com esse
          recurso na página de planos.
        </p>
      </div>
    )
  }

  if (eventAnalyticsState.status === 'empty') {
    return (
      <div className="onside-panel-acid p-4">
        <PerformanceHeading />
        <p className="text-sm text-[var(--onside-ink)] opacity-60">
          Os números aparecem quando torcedores chegarem ao seu bar pelos jogos
          que você cadastrou.
        </p>
      </div>
    )
  }

  if (eventAnalyticsState.status !== 'ready' || !eventAnalyticsState.items)
    return null

  const items = eventAnalyticsState.items

  const topEvent = items.reduce<EventAnalyticsRow | null>((best, item) => {
    const intent = sumAnalyticsActions(item)
    const bestIntent = best ? sumAnalyticsActions(best) : null
    if (intent === null) return best
    return !best || bestIntent === null || intent > bestIntent ? item : best
  }, null)

  const topEventIntent = topEvent ? sumAnalyticsActions(topEvent) : null

  return (
    <div className="onside-panel-acid p-4">
      <PerformanceHeading />
      <p className="mb-3 text-[var(--onside-ink)] text-xs opacity-60">
        Janela consultada:{' '}
        {formatAnalyticsPeriod(
          eventAnalyticsState.from,
          eventAnalyticsState.to
        )}
      </p>

      <ComparisonControls
        items={items}
        mode={eventAnalyticsState.comparisonMode}
        target={eventAnalyticsState.comparisonTarget}
        loading={eventAnalyticsState.comparisonLoading}
        onChange={eventAnalyticsState.onComparisonTargetChange}
      />

      <ComparisonResult
        comparison={eventAnalyticsState.comparison}
        mode={eventAnalyticsState.comparisonMode}
        loading={eventAnalyticsState.comparisonLoading}
      />

      {topEvent && topEventIntent !== null && (
        <div className="mb-3 flex items-center gap-2 border border-[var(--onside-ink)] bg-[var(--onside-ink)] px-3 py-2 text-sm text-[var(--onside-paper)]">
          <Check size={14} color="currentColor" aria-hidden="true" />
          Melhor jogo: {topEvent.eventName} ({topEventIntent}{' '}
          {topEventIntent === 1 ? 'interessado' : 'interessados'})
        </div>
      )}

      <PerformanceColumns />
      <div>
        {items.map((item) => (
          <EventPerformanceRow key={item.eventId} item={item} />
        ))}
      </div>
    </div>
  )
}
