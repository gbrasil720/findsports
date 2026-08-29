import { Skeleton } from '@findsports_oficial/ui/components/skeleton'
import AlertCircle from 'reicon-react/icons/AlertCircle'
import ArrowRight from 'reicon-react/icons/ArrowRight'
import Check from 'reicon-react/icons/Check'
import {
  type AnalyticsOverviewData,
  formatRate,
  getMainAction
} from './admin-model'
import { getMetric, type MetricId } from './metric-glossary'
import { MetricHint } from './metric-hint'

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function formatPctChange(val: number | null): string {
  if (val === null) return '—'
  if (val === 0) return '0%'
  return `${val > 0 ? '+' : ''}${val}%`
}

/**
 * Variação de uma taxa em pontos percentuais.
 *
 * Taxa não varia em "%": sair de 8,3% para 12,1% é +3,8 p.p. Dizer "+46%"
 * seria tecnicamente possível e completamente ilegível pra quem lê o painel.
 */
function formatPpChange(curr: number | null, prev: number | null): string {
  if (curr === null || prev === null) return '—'
  const diff = (curr - prev) * 100
  if (Math.abs(diff) < 0.05) return '0 p.p.'
  return `${diff > 0 ? '+' : ''}${diff.toFixed(1)} p.p.`
}

function sumIntentActions(data: AnalyticsOverviewData): number {
  return (
    (data.whatsappOpened ?? 0) +
    (data.directionsOpened ?? 0) +
    (data.phoneClicked ?? 0)
  )
}

/** Título de seção com o ⓘ do glossário ao lado. */
function SectionHeading({ metric }: { metric: MetricId }) {
  return (
    <h3 className="onside-heading mb-3">
      {getMetric(metric).label}
      <MetricHint metric={metric} />
    </h3>
  )
}

function hasComparisonData(data: AnalyticsOverviewData): boolean {
  return (
    (data.phoneClickedPrev ?? 0) > 0 ||
    (data.whatsappOpenedPrev ?? 0) > 0 ||
    (data.directionsOpenedPrev ?? 0) > 0 ||
    data.profileViewsPrev > 0
  )
}

function formatPeriod(from: string, to: string): string {
  const f = new Date(from)
  const t = new Date(to)
  return `${f.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })} — ${t.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })}`
}

/* ------------------------------------------------------------------ */
/* Skeleton                                                            */
/* ------------------------------------------------------------------ */

function OverviewSkeleton() {
  return (
    <section aria-label="Visão geral carregando">
      <header className="mb-6">
        <Skeleton className="mb-2 h-7 w-48" />
        <Skeleton className="h-4 w-32" />
      </header>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="onside-panel-acid p-4">
            <Skeleton className="mb-2 h-4 w-20" />
            <Skeleton className="h-7 w-16" />
          </div>
        ))}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="onside-panel-acid p-4">
          <Skeleton className="mb-3 h-5 w-36" />
          <Skeleton className="h-48 w-full" />
        </div>
        <div className="onside-panel-acid p-4">
          <Skeleton className="mb-3 h-5 w-40" />
          {[1, 2, 3].map((i) => (
            <div key={i} className="mb-3">
              <Skeleton className="mb-1 h-4 w-24" />
              <Skeleton className="h-3 w-full" />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* Error                                                               */
/* ------------------------------------------------------------------ */

function OverviewError({ onRetry }: { onRetry: () => void }) {
  return (
    <section aria-label="Visão geral">
      <div className="onside-callout onside-callout-danger" role="alert">
        <AlertCircle
          size={20}
          color="currentColor"
          className="mt-0.5 shrink-0"
          aria-hidden="true"
        />
        <p className="flex-1">
          Não foi possível carregar as analytics. Tente novamente.
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="onside-btn onside-btn-ink shrink-0"
        >
          Tentar novamente
        </button>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* KPI Cards                                                           */
/* ------------------------------------------------------------------ */

function KpiCard({
  metric,
  value,
  secondary,
  change,
  accent
}: {
  metric: MetricId
  value: string
  /** Contexto do número principal, sempre visível. */
  secondary?: string
  /** Variação percentual contra o período anterior. */
  change?: string
  accent?: 'acid'
}) {
  const { label } = getMetric(metric)

  return (
    <div
      className={
        'onside-panel-acid p-4' +
        (accent ? ' ring-2 ring-[var(--onside-acid)]' : '')
      }
    >
      <p className="onside-label mb-1 text-[var(--onside-ink)] opacity-70">
        {label}
        <MetricHint metric={metric} />
      </p>
      <p className="onside-display text-2xl text-[var(--onside-ink)]">
        {value}
      </p>
      {secondary !== undefined && (
        <p className="mt-1 text-xs text-[var(--onside-ink)] opacity-70">
          {secondary}
        </p>
      )}
      {change !== undefined && (
        <p className="mt-1 text-xs text-[var(--onside-ink)] opacity-60">
          {change} vs 30 dias anteriores
        </p>
      )}
    </div>
  )
}

function KpiCards({ data }: { data: AnalyticsOverviewData }) {
  const intentActions = sumIntentActions(data)
  const intentActionsPrev =
    (data.whatsappOpenedPrev ?? 0) +
    (data.directionsOpenedPrev ?? 0) +
    (data.phoneClickedPrev ?? 0)

  /* A API não devolve variação agregada de intenção — só por canal. Somar os
     canais do período anterior dá o mesmo número sem custo de backend. */
  const intentChange =
    intentActionsPrev > 0
      ? Math.round(
          ((intentActions - intentActionsPrev) / intentActionsPrev) * 100
        )
      : null

  /* A taxa mede pessoas, não aberturas: "de cada 100 que viram, X se
     interessaram" só faz sentido com visitantes únicos no denominador. */
  const intentRate = formatRate(intentActions, data.uniqueVisitors)
  const intentRateChange = formatPpChange(
    data.uniqueVisitors > 0 ? intentActions / data.uniqueVisitors : null,
    data.uniqueVisitorsPrev > 0
      ? intentActionsPrev / data.uniqueVisitorsPrev
      : null
  )

  const views = data.profileViews.toLocaleString('pt-BR')

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <KpiCard
        metric="reach"
        value={data.uniqueVisitors.toLocaleString('pt-BR')}
        secondary={`abriram ${views} ${data.profileViews === 1 ? 'vez' : 'vezes'} no total`}
        change={formatPctChange(data.uniqueVisitorsChange)}
      />
      <KpiCard
        metric="interest"
        value={intentActions.toLocaleString('pt-BR')}
        change={formatPctChange(intentChange)}
        accent="acid"
      />
      <KpiCard
        metric="interestRate"
        value={intentRate}
        secondary="de quem viu seu bar"
        change={intentRateChange}
      />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Daily Chart                                                         */
/* ------------------------------------------------------------------ */

function DailyChart({
  dailyViews,
  dailyWa,
  dailyDir,
  dailyPh
}: {
  dailyViews: Array<{ date: string; value: number }> | null
  dailyWa: Array<{ date: string; value: number }> | null
  dailyDir: Array<{ date: string; value: number }> | null
  dailyPh: Array<{ date: string; value: number }> | null
}) {
  if (!dailyViews?.length) return null

  const series = dailyViews.map((v) => {
    const wa = dailyWa?.find((a) => a.date === v.date)?.value ?? 0
    const dir = dailyDir?.find((a) => a.date === v.date)?.value ?? 0
    const ph = dailyPh?.find((a) => a.date === v.date)?.value ?? 0
    return {
      date: v.date,
      views: v.value,
      actions: wa + dir + ph
    }
  })

  const maxVal = Math.max(...series.flatMap((p) => [p.views, p.actions]))
  const chartHeight = 160

  return (
    <div className="onside-panel-acid p-4">
      <h3 className="onside-heading mb-3">Atividade diária</h3>
      <div className="relative h-[160px]">
        <svg
          viewBox={`0 0 ${series.length * 28 + 16} ${chartHeight}`}
          className="h-full w-full"
          role="img"
          aria-label="Gráfico de atividade diária"
        >
          {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
            const y = chartHeight - frac * chartHeight + 4
            return (
              <line
                key={frac}
                x1={0}
                y1={y}
                x2={series.length * 28 + 16}
                y2={y}
                stroke="var(--onside-line)"
                strokeWidth={0.5}
              />
            )
          })}

          <polyline
            fill="none"
            stroke="var(--onside-ink)"
            strokeWidth={2}
            points={series
              .map((p, i) => {
                const x = i * 28 + 16
                const y =
                  chartHeight - (p.views / (maxVal || 1)) * (chartHeight - 8)
                return `${x},${y}`
              })
              .join(' ')}
          />

          <polyline
            fill="none"
            stroke="var(--onside-live)"
            strokeWidth={2}
            strokeDasharray="4 2"
            points={series
              .map((p, i) => {
                const x = i * 28 + 16
                const y =
                  chartHeight - (p.actions / (maxVal || 1)) * (chartHeight - 8)
                return `${x},${y}`
              })
              .join(' ')}
          />

          {series.map((p) => {
            const i = series.indexOf(p)
            const x = i * 28 + 16
            const y =
              chartHeight - (p.views / (maxVal || 1)) * (chartHeight - 8)
            return (
              <circle
                key={`v-${p.date}`}
                cx={x}
                cy={y}
                r={3}
                fill="var(--onside-ink)"
              />
            )
          })}

          {series.map((p) => {
            const i = series.indexOf(p)
            const x = i * 28 + 16
            const y =
              chartHeight - (p.actions / (maxVal || 1)) * (chartHeight - 8)
            return (
              <circle
                key={`a-${p.date}`}
                cx={x}
                cy={y}
                r={3}
                fill="var(--onside-live)"
              />
            )
          })}
        </svg>
      </div>

      <div className="mt-2 flex items-center gap-4 text-xs text-[var(--onside-ink)] opacity-70">
        <span className="flex items-center gap-1">
          <span className="inline-block size-2 rounded-full bg-[var(--onside-ink)]" />
          Aberturas
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block size-2 rounded-full bg-[var(--onside-live)]" />
          Se interessaram
        </span>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Action Distribution                                                 */
/* ------------------------------------------------------------------ */

function ActionDistributionView({ data }: { data: AnalyticsOverviewData }) {
  const items: Array<{ label: string; count: number }> = [
    { label: 'WhatsApp', count: data.whatsappOpened ?? 0 },
    { label: 'Rota', count: data.directionsOpened ?? 0 },
    { label: 'Telefone', count: data.phoneClicked ?? 0 }
  ]

  const total = items.reduce((s, i) => s + i.count, 0)
  if (total === 0) return null

  const mainAction = getMainAction(data)

  return (
    <div className="onside-panel-acid p-4">
      <SectionHeading metric="channels" />

      {mainAction && (
        <div className="mb-3 flex items-center gap-2 border border-[var(--onside-ink)] bg-[var(--onside-ink)] px-3 py-2 text-sm text-[var(--onside-paper)]">
          <Check size={14} color="currentColor" aria-hidden="true" />
          Mais usado: {mainAction}
        </div>
      )}

      <div className="space-y-2">
        {items.map((item) => {
          const pct = total > 0 ? (item.count / total) * 100 : 0
          return (
            <div key={item.label}>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="text-[var(--onside-ink)] opacity-80">
                  {item.label}
                </span>
                <span className="font-medium text-[var(--onside-ink)]">
                  {item.count}
                  <span className="ml-1 text-xs opacity-50">
                    ({pct.toFixed(0)}%)
                  </span>
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-sm bg-[var(--onside-paper)]">
                <div
                  className="h-full bg-[var(--onside-ink)] transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Period Comparison                                                   */
/* ------------------------------------------------------------------ */

function PeriodComparison({ data }: { data: AnalyticsOverviewData }) {
  if (!hasComparisonData(data)) {
    return (
      <div className="onside-panel-acid p-4">
        <SectionHeading metric="periodComparison" />
        <p className="text-sm text-[var(--onside-ink)] opacity-70">
          Ainda não há dados dos 30 dias anteriores. A comparação aparece assim
          que houver histórico suficiente.
        </p>
      </div>
    )
  }

  const rows = [
    {
      label: 'Aberturas',
      curr: data.profileViews,
      change: data.profileViewsChange
    },
    {
      label: 'WhatsApp',
      curr: data.whatsappOpened ?? 0,
      change: data.whatsappOpenedChange
    },
    {
      label: 'Rota',
      curr: data.directionsOpened ?? 0,
      change: data.directionsOpenedChange
    },
    {
      label: 'Telefone',
      curr: data.phoneClicked ?? 0,
      change: data.phoneClickedChange
    }
  ]

  return (
    <div className="onside-panel-acid p-4">
      <SectionHeading metric="periodComparison" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {rows.map((r) => (
          <div key={r.label}>
            <p className="text-xs text-[var(--onside-ink)] opacity-60">
              {r.label}
            </p>
            <p className="onside-display text-lg text-[var(--onside-ink)]">
              {r.curr}
            </p>
            <p className="text-xs text-[var(--onside-ink)] opacity-60">
              {r.change !== null ? formatPctChange(r.change) : '—'}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Main component                                                      */
/* ------------------------------------------------------------------ */

export function AnalyticsOverview({
  overviewState,
  onCreateEvent
}: {
  overviewState: {
    status: 'loading' | 'error' | 'empty' | 'partial' | 'ready'
    data?: AnalyticsOverviewData
    retry?: () => void
  }
  onCreateEvent?: () => void
}) {
  if (overviewState.status === 'loading') return <OverviewSkeleton />
  if (overviewState.status === 'error' && overviewState.retry)
    return <OverviewError onRetry={overviewState.retry} />

  if (overviewState.status === 'empty') {
    return (
      <section aria-label="Visão geral">
        <h2 className="onside-display mb-4 text-2xl">Desempenho do bar</h2>
        <div className="onside-panel-acid flex flex-col items-center gap-4 p-12 text-center">
          <p className="onside-display mb-1 text-xl text-[var(--onside-ink)]">
            Aguardando primeiros dados
          </p>
          <p className="max-w-sm text-sm text-[var(--onside-ink)] opacity-70">
            Os números aparecem quando torcedores começarem a abrir a página do
            seu bar. Cada abertura e cada tentativa de contato entra aqui
            automaticamente.
          </p>
          {onCreateEvent && (
            <button
              type="button"
              onClick={onCreateEvent}
              className="onside-btn onside-btn-ink"
            >
              <ArrowRight size={16} color="currentColor" aria-hidden="true" />
              Cadastrar primeiro jogo
            </button>
          )}
        </div>
      </section>
    )
  }

  if (
    (overviewState.status !== 'ready' && overviewState.status !== 'partial') ||
    !overviewState.data
  ) {
    return null
  }

  const data = overviewState.data

  return (
    <section aria-label="Visão geral">
      <header className="mb-6 flex items-end justify-between">
        <div>
          <h2 className="onside-display text-2xl">Desempenho do bar</h2>
          <p className="mt-1 text-sm text-[var(--onside-ink)] opacity-60">
            {formatPeriod(data.from, data.to)} • Plano: {data.plan ?? '—'}
          </p>
        </div>
      </header>

      <KpiCards data={data} />

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <DailyChart
          dailyViews={data.dailyProfileViews}
          dailyWa={data.dailyWhatsappOpened}
          dailyDir={data.dailyDirectionsOpened}
          dailyPh={data.dailyPhoneClicked}
        />
        <ActionDistributionView data={data} />
      </div>

      <div className="mt-6">
        <PeriodComparison data={data} />
      </div>
    </section>
  )
}
