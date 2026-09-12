import type {
  AnalyticsComparisonMode,
  ComparisonMetric,
  EventComparisonTarget
} from '@findsports_oficial/api/lib/commercial-analytics/types'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from '@findsports_oficial/ui/components/accordion'
import { Checkbox } from '@findsports_oficial/ui/components/checkbox'
import { Label } from '@findsports_oficial/ui/components/label'
import {
  RadioGroup,
  RadioGroupItem
} from '@findsports_oficial/ui/components/radio-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@findsports_oficial/ui/components/select'
import { Skeleton } from '@findsports_oficial/ui/components/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@findsports_oficial/ui/components/table'
import { useId } from 'react'
import AlertCircle from 'reicon-react/icons/AlertCircle'
import Check from 'reicon-react/icons/Check'
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

const COMPARISON_METRICS = [
  'uniqueVisitors',
  'profileViews',
  'directionsOpened',
  'phoneClicked',
  'whatsappOpened'
] as const

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
  const targetLabelId = useId()

  if (!mode || mode === 'previous_period' || !onChange) return null

  const selectedIds = target?.type === 'events' ? target.eventIds : []
  const isBarAverage = target?.type === 'event_to_bar'
  const selectItems = items.map((item) => ({
    value: item.eventId,
    label: item.eventName
  }))

  const chooseEvents = () => {
    const ids = selectedIds.length
      ? selectedIds
      : items.slice(0, 2).map((item) => item.eventId)
    if (ids.length > 0) onChange({ type: 'events', eventIds: ids })
  }

  const chooseBarAverage = () => {
    const eventId =
      target?.type === 'event_to_bar' ? target.eventId : items[0]?.eventId
    if (eventId) onChange({ type: 'event_to_bar', eventId })
  }

  const toggleEvent = (eventId: string) => {
    const next = selectedIds.includes(eventId)
      ? selectedIds.filter((id) => id !== eventId)
      : [...selectedIds, eventId]
    onChange(next.length > 0 ? { type: 'events', eventIds: next } : undefined)
  }

  return (
    <fieldset className="onside-fieldset mb-4">
      <legend className="onside-fieldset-legend">
        Comparação disponível no plano {mode === 'advanced' ? 'Elite' : 'Pro'}
      </legend>

      <RadioGroup
        aria-label="Tipo de comparação"
        value={isBarAverage ? 'event_to_bar' : 'events'}
        onValueChange={(value) => {
          if (value === 'event_to_bar') chooseBarAverage()
          else chooseEvents()
        }}
        className="flex flex-wrap items-center gap-x-6 gap-y-0"
      >
        <Label className="onside-choice-row">
          <RadioGroupItem value="events" />
          Entre jogos
        </Label>
        <Label className="onside-choice-row">
          <RadioGroupItem value="event_to_bar" />
          Jogo contra média do bar
        </Label>
      </RadioGroup>

      {!isBarAverage && (
        <div className="mt-2 grid gap-0 sm:grid-cols-2">
          {items.map((item) => (
            <Label key={item.eventId} className="onside-choice-row min-w-0">
              <Checkbox
                checked={selectedIds.includes(item.eventId)}
                onCheckedChange={() => toggleEvent(item.eventId)}
              />
              <span className="truncate">{item.eventName}</span>
            </Label>
          ))}
        </div>
      )}

      {isBarAverage && (
        <div className="mt-3 max-w-md">
          {/* `Label` sem `htmlFor`: o gatilho do Select é um `button`, que não
              é elemento rotulável — quem nomeia é o `aria-labelledby`. */}
          <Label id={targetLabelId} className="onside-label">
            Jogo alvo
          </Label>
          <Select
            items={selectItems}
            value={target.type === 'event_to_bar' ? target.eventId : ''}
            onValueChange={(value) => {
              if (typeof value === 'string' && value) {
                onChange({ type: 'event_to_bar', eventId: value })
              }
            }}
          >
            <SelectTrigger
              aria-labelledby={targetLabelId}
              className="onside-select h-12 min-h-12 w-full text-sm"
            >
              <SelectValue placeholder="Selecione um jogo" />
            </SelectTrigger>
            <SelectContent>
              {items.map((item) => (
                <SelectItem key={item.eventId} value={item.eventId}>
                  {item.eventName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div
        className="mt-2 flex flex-wrap items-center gap-x-3"
        aria-live="polite"
      >
        {!isBarAverage && selectedIds.length < 2 && (
          <p className="onside-hint">
            Selecione pelo menos dois jogos com dados.
          </p>
        )}
        {loading && <p className="onside-hint">Calculando…</p>}
      </div>
    </fieldset>
  )
}

function ComparisonTable({ comparison }: { comparison: EventComparisonData }) {
  const rows = comparison.benchmark
    ? [...comparison.events, comparison.benchmark]
    : comparison.events

  return (
    <Table className="min-w-[620px]">
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="pl-0">Jogo</TableHead>
          {COMPARISON_METRICS.map((metric) => (
            <TableHead key={metric} className="text-right">
              {COMPARISON_METRIC_LABELS[metric]}
            </TableHead>
          ))}
          <TableHead className="pr-0 text-right">Conversão</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.eventId}>
            <TableHead
              scope="row"
              className="max-w-44 truncate py-2 pr-2 pl-0 font-medium"
            >
              {row.eventName}
            </TableHead>
            {COMPARISON_METRICS.map((metric) => (
              <TableCell key={metric} className="text-right tabular-nums">
                {formatComparisonNumber(row[metric])}
              </TableCell>
            ))}
            <TableCell className="pr-0 text-right font-medium tabular-nums">
              {formatConversionRate(row.conversionRate)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
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
      <div
        className="onside-panel mb-4 space-y-4 p-4"
        role="status"
        aria-busy="true"
        aria-live="polite"
      >
        <span className="sr-only">
          Calculando comparação com os dados do bar…
        </span>
        <Skeleton className="h-5 w-44" />
        <Skeleton className="h-3 w-3/4 max-w-full" />
        <div className="overflow-hidden">
          <div className="grid grid-cols-3 gap-3 border-b border-[var(--onside-line)] pb-2">
            {[1, 2, 3].map((item) => (
              <Skeleton key={item} className="h-3 w-full" />
            ))}
          </div>
          {[1, 2, 3].map((item) => (
            <div key={item} className="grid grid-cols-3 gap-3 py-3">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3 justify-self-end" />
              <Skeleton className="h-4 w-2/3 justify-self-end" />
            </div>
          ))}
        </div>
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
      <div className="onside-panel mb-4 p-4 text-sm text-[var(--onside-muted)]">
        {message}
      </div>
    )
  }

  const ranking = comparison.ranking
  const historyBenchmarks = comparison.benchmarks.filter(
    (benchmark) => benchmark.scope === 'history'
  )

  return (
    <div className="onside-panel mb-4 space-y-4 p-4">
      <div>
        <h4 className="onside-heading mb-1">Comparação calculada</h4>
        <p className="onside-hint">
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
              <p className="onside-hint">
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
    <div
      className="onside-panel-acid p-4"
      role="status"
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">Carregando desempenho por jogo…</span>
      <Skeleton className="mb-2 h-6 w-48 bg-[var(--onside-paper)]" />
      <Skeleton className="mb-4 h-3 w-56 bg-[var(--onside-paper)]" />
      <div className="grid grid-cols-[minmax(0,1fr)_4.25rem_1.25rem] items-center gap-x-3 border-[var(--onside-line)] border-b pb-1.5 sm:grid-cols-[minmax(0,1fr)_repeat(3,4.25rem)_1.25rem]">
        <Skeleton className="h-3 w-20 bg-[var(--onside-paper)]" />
        <Skeleton className="hidden h-3 w-12 justify-self-end bg-[var(--onside-paper)] sm:block" />
        <Skeleton className="h-3 w-12 justify-self-end bg-[var(--onside-paper)]" />
        <Skeleton className="hidden h-3 w-12 justify-self-end bg-[var(--onside-paper)] sm:block" />
        <span />
      </div>
      <div className="space-y-1">
        {[1, 2, 3].map((item) => (
          <div
            key={item}
            className="grid min-h-[44px] grid-cols-[minmax(0,1fr)_4.25rem_1.25rem] items-center gap-x-3 px-2 sm:grid-cols-[minmax(0,1fr)_repeat(3,4.25rem)_1.25rem]"
          >
            <Skeleton className="h-4 w-3/4 bg-[var(--onside-paper)]" />
            <Skeleton className="hidden h-4 w-8 justify-self-end bg-[var(--onside-paper)] sm:block" />
            <Skeleton className="h-4 w-8 justify-self-end bg-[var(--onside-paper)]" />
            <Skeleton className="hidden h-4 w-8 justify-self-end bg-[var(--onside-paper)] sm:block" />
            <Skeleton className="size-3 bg-[var(--onside-paper)]" />
          </div>
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
  onRetry,
  retryable
}: {
  message?: string
  onRetry: () => void
  retryable: boolean
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
      {retryable ? (
        <button
          type="button"
          onClick={onRetry}
          className="onside-btn onside-btn-ink shrink-0"
        >
          Tentar novamente
        </button>
      ) : null}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Event Row                                                           */
/* ------------------------------------------------------------------ */

/**
 * Trilha de colunas compartilhada pelo cabeçalho e pelas linhas — é o que
 * mantém os números alinhados sem repetir o rótulo em cada linha. A última
 * faixa é do chevron do accordion, que fecha a linha na mesma coluna em todas
 * elas em vez de flutuar antes do nome.
 *
 * No celular só sobra "Interesse": as outras duas colunas não cabem sem
 * espremer o nome do jogo, e o detalhe completo já está no painel expandido.
 */
const ROW_GRID =
  'grid grid-cols-[minmax(0,1fr)_4.25rem_1.25rem] items-center gap-x-3 sm:grid-cols-[minmax(0,1fr)_repeat(3,4.25rem)_1.25rem]'

function PerformanceColumns() {
  return (
    <div
      className={`${ROW_GRID} border-[var(--onside-line)] border-b pb-1.5 font-[family-name:var(--onside-mono)] text-[10px] text-[var(--onside-muted)] uppercase tracking-[0.1em]`}
      aria-hidden="true"
    >
      <span />
      <span className="hidden text-right sm:block">Aberturas</span>
      <span className="text-right">Interesse</span>
      <span className="hidden text-right sm:block">Taxa</span>
      <span />
    </div>
  )
}

function EventPerformanceRow({ item }: { item: EventAnalyticsRow }) {
  const intentActions = sumAnalyticsActions(item)

  return (
    <AccordionItem value={item.eventId}>
      <AccordionTrigger
        headingLevel={4}
        className={`${ROW_GRID} px-2 py-2.5 text-sm`}
      >
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="truncate font-medium text-[var(--onside-ink)]">
            {item.eventName}
          </span>
          <span className="shrink-0 text-[var(--onside-ink)] text-xs opacity-60">
            {formatEventDate(item.startsAt)}
          </span>
        </span>

        {/* O cabeçalho é só alinhamento visual, então cada número carrega o
            próprio rótulo pra leitor de tela. */}
        <span className="hidden text-right font-medium text-[var(--onside-ink)] tabular-nums sm:block">
          <span className="sr-only">Aberturas: </span>
          {item.profileViews}
        </span>
        <span className="text-right font-medium text-[var(--onside-ink)] tabular-nums">
          <span className="sr-only">Interesse: </span>
          {formatAnalyticsValue(intentActions)}
        </span>
        <span className="hidden text-right font-medium text-[var(--onside-ink)] tabular-nums sm:block">
          <span className="sr-only">Taxa: </span>
          {intentActions === null
            ? formatAnalyticsValue(null)
            : formatRate(intentActions, item.profileViews)}
        </span>
      </AccordionTrigger>

      <AccordionContent className="px-2 pb-3">
        <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-[var(--onside-ink)] text-sm sm:grid-cols-4">
          <div>
            <dt className="onside-hint">WhatsApp</dt>
            <dd className="font-medium tabular-nums">
              {formatAnalyticsValue(item.whatsappOpened)}
            </dd>
          </div>
          <div>
            <dt className="onside-hint">Rota</dt>
            <dd className="font-medium tabular-nums">
              {formatAnalyticsValue(item.directionsOpened)}
            </dd>
          </div>
          <div>
            <dt className="onside-hint">Telefone</dt>
            <dd className="font-medium tabular-nums">
              {formatAnalyticsValue(item.phoneClicked)}
            </dd>
          </div>
          <div>
            <dt className="onside-hint">Mais usado</dt>
            <dd className="font-medium">{getMainAction(item) ?? '—'}</dd>
          </div>

          {/* No celular as colunas de aberturas e taxa saem do cabeçalho;
              aqui elas reaparecem pra não sumir a informação. */}
          <div className="sm:hidden">
            <dt className="onside-hint">Aberturas</dt>
            <dd className="font-medium tabular-nums">{item.profileViews}</dd>
          </div>
          <div className="sm:hidden">
            <dt className="onside-hint">Taxa</dt>
            <dd className="font-medium tabular-nums">
              {intentActions === null
                ? formatAnalyticsValue(null)
                : formatRate(intentActions, item.profileViews)}
            </dd>
          </div>
        </dl>
      </AccordionContent>
    </AccordionItem>
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
        retryable={eventAnalyticsState.retryable}
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
      <p className="onside-hint mb-3">
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
        <div className="onside-panel-ink mb-3 flex items-center gap-2 px-3 py-2 text-sm">
          <Check size={14} color="currentColor" aria-hidden="true" />
          Melhor jogo: {topEvent.eventName} ({topEventIntent}{' '}
          {topEventIntent === 1 ? 'interessado' : 'interessados'})
        </div>
      )}

      <PerformanceColumns />
      <Accordion>
        {items.map((item) => (
          <EventPerformanceRow key={item.eventId} item={item} />
        ))}
      </Accordion>
    </div>
  )
}
