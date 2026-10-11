import { Skeleton } from '@findsports_oficial/ui/components/skeleton'
import { type KeyboardEvent, type PointerEvent, useState } from 'react'
import AlertCircle from 'reicon-react/icons/AlertCircle'
import ArrowRight from 'reicon-react/icons/ArrowRight'
import Check from 'reicon-react/icons/Check'
import { getPlan } from '@/lib/plan-catalog'
import {
  type AnalyticsOverviewData,
  type AnalyticsOverviewState,
  formatAnalyticsValue,
  formatInterestRate,
  getInterestRate,
  getMainAction
} from './admin-model'
import {
  formatAnalyticsPeriod,
  formatComparisonPeriod
} from './analytics-period'
import { buildSeries, niceMax, tickIndexes } from './daily-chart-model'
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

/**
 * Número de resultado: Anton com o marca-texto do painel (`onside-mark`).
 * Zero e "—" ficam sem marca: o destaque é para valor entregue, e um bar nos
 * primeiros dias veria o verde apontando para nada.
 */
const mark = (value: string | number) =>
  `onside-display ${Number.parseFloat(String(value)) > 0 ? 'onside-mark' : 'tabular-nums'}`

/** Variação contra o período anterior: a alta sai em selo acid com seta. */
function Change({ text }: { text: string }) {
  if (text.startsWith('+')) {
    return (
      <span className="onside-badge onside-badge-acid tabular-nums">
        ↑ {text}
      </span>
    )
  }
  return (
    <span className="tabular-nums">
      {text.startsWith('-') ? `↓ ${text}` : text}
    </span>
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
    (data.phoneClickedPrev !== null && data.phoneClickedPrev > 0) ||
    (data.whatsappOpenedPrev !== null && data.whatsappOpenedPrev > 0) ||
    (data.directionsOpenedPrev !== null && data.directionsOpenedPrev > 0) ||
    (data.profileViewsPrev !== null && data.profileViewsPrev > 0)
  )
}

/* ------------------------------------------------------------------ */
/* Skeleton                                                            */
/* ------------------------------------------------------------------ */

function OverviewSkeleton() {
  return (
    <section
      className="[&_[data-slot=skeleton]]:bg-[var(--onside-stone)]"
      aria-label="Visão geral carregando"
      role="status"
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">Carregando desempenho do bar…</span>
      <header className="mb-6">
        <Skeleton className="mb-2 h-7 w-48" />
        <Skeleton className="h-4 w-32" />
      </header>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="onside-panel p-4">
            <Skeleton className="mb-2 h-4 w-20" />
            <Skeleton className="h-7 w-16" />
            <Skeleton className="mt-2 h-3 w-28" />
            <Skeleton className="mt-2 h-3 w-24" />
          </div>
        ))}
      </div>

      <div className="onside-panel mt-6 p-4">
        <Skeleton className="mb-3 h-5 w-36" />
        <div className="mb-4 flex gap-4">
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-9 w-28" />
        </div>
        <div className="relative h-[200px] space-y-16 pt-2 sm:h-[240px]">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-px w-full" />
          ))}
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="onside-panel p-4">
          <Skeleton className="mb-3 h-5 w-40" />
          {[1, 2, 3].map((i) => (
            <div key={i} className="mb-3">
              <div className="mb-1 flex justify-between">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-10" />
              </div>
              <Skeleton className="h-3 w-full" />
            </div>
          ))}
        </div>
        <div className="onside-panel p-4">
          <Skeleton className="mb-3 h-5 w-44" />
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-6 w-12" />
                <Skeleton className="h-3 w-14" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* Error                                                               */
/* ------------------------------------------------------------------ */

function OverviewError({
  message,
  onRetry,
  retryable
}: {
  message?: string
  onRetry: () => void
  retryable: boolean
}) {
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
          {message ||
            'Não foi possível carregar as analytics. Tente novamente.'}
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
  comparisonLabel
}: {
  metric: MetricId
  value: string
  /** Contexto do número principal, sempre visível. */
  secondary?: string
  /** Variação percentual contra o período anterior. */
  change?: string
  /** `null` quando a janela não tem período anterior ("Tudo"). */
  comparisonLabel: string | null
}) {
  const { label } = getMetric(metric)

  return (
    <div className="onside-panel p-4">
      <p className="onside-label opacity-70">
        {label}
        <MetricHint metric={metric} />
      </p>
      <p>
        <span className={`${mark(value)} text-4xl`}>{value}</span>
      </p>
      {secondary !== undefined && (
        <p className="mt-2 text-[var(--onside-muted)] text-xs">{secondary}</p>
      )}
      {change !== undefined && comparisonLabel !== null && (
        <p className="mt-2 flex flex-wrap items-center gap-1.5 text-[var(--onside-muted)] text-xs">
          <Change text={change} /> vs {comparisonLabel}
        </p>
      )}
    </div>
  )
}

function KpiCards({
  data,
  comparisonLabel
}: {
  data: AnalyticsOverviewData
  comparisonLabel: string | null
}) {
  /* Pessoas dos dois lados (WEB-251): quem abriu WhatsApp e rota é uma pessoa
     interessada, não duas. Somar os canais dava "200%" com um visitante. */
  const interestRate = getInterestRate(
    data.interestedPeople,
    data.uniqueVisitors
  )
  const interestRatePrev =
    data.interestedPeoplePrev !== null && data.uniqueVisitorsPrev !== null
      ? getInterestRate(data.interestedPeoplePrev, data.uniqueVisitorsPrev)
      : null

  const views = data.profileViews.toLocaleString('pt-BR')

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <KpiCard
        metric="reach"
        value={data.uniqueVisitors.toLocaleString('pt-BR')}
        secondary={`abriram ${views} ${data.profileViews === 1 ? 'vez' : 'vezes'} no total`}
        change={formatPctChange(data.uniqueVisitorsChange)}
        comparisonLabel={comparisonLabel}
      />
      <KpiCard
        metric="interest"
        value={data.interestedPeople.toLocaleString('pt-BR')}
        change={formatPctChange(data.interestedPeopleChange)}
        comparisonLabel={comparisonLabel}
      />
      <KpiCard
        metric="interestRate"
        value={formatInterestRate(data.interestedPeople, data.uniqueVisitors)}
        secondary="de quem viu seu bar"
        change={formatPpChange(interestRate, interestRatePrev)}
        comparisonLabel={comparisonLabel}
      />
    </div>
  )
}

function ClassicPlacement({
  data,
  comparisonLabel
}: {
  data: AnalyticsOverviewData
  comparisonLabel: string | null
}) {
  if (data.classicExposures === null || data.classicClicks === null) {
    return null
  }

  const clickRate =
    data.classicExposures > 0
      ? `${((data.classicClicks / data.classicExposures) * 100).toFixed(1)}%`
      : '—'

  return (
    <div className="onside-panel mt-6 p-4">
      <h3 className="onside-heading mb-1">Entrega Elite nos clássicos</h3>
      <p className="mb-3 text-sm text-[var(--onside-ink)] opacity-70">
        Quantas vezes seu bar apareceu na posição garantida e quantas pessoas
        abriram o perfil a partir dessa posição.
      </p>
      <div className="grid grid-cols-3 gap-4">
        <div>
          <p className="text-xs text-[var(--onside-ink)] opacity-60">
            Exposições
          </p>
          <p className={`${mark(data.classicExposures)} mt-1 text-2xl`}>
            {data.classicExposures}
          </p>
        </div>
        <div>
          <p className="text-xs text-[var(--onside-ink)] opacity-60">Cliques</p>
          <p className={`${mark(data.classicClicks)} mt-1 text-2xl`}>
            {data.classicClicks}
          </p>
        </div>
        <div>
          <p className="text-xs text-[var(--onside-ink)] opacity-60">CTR</p>
          <p className={`${mark(clickRate)} mt-1 text-2xl`}>{clickRate}</p>
        </div>
      </div>
      {comparisonLabel !== null && (
        <p className="mt-3 flex flex-wrap items-center gap-1.5 text-[var(--onside-muted)] text-xs">
          Exposições{' '}
          <Change text={formatPctChange(data.classicExposuresChange)} /> •
          Cliques <Change text={formatPctChange(data.classicClicksChange)} /> vs{' '}
          {comparisonLabel}
        </p>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Daily Chart                                                         */
/* ------------------------------------------------------------------ */

type DailySeries = Array<{ date: string; value: number }> | null

/** `2026-10-11` → `11/10`. */
const shortDay = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}`

/** A data vem sem hora: lida e escrita em UTC, o dia não escorrega. */
const longDay = (date: string) =>
  new Date(date).toLocaleDateString('pt-BR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC'
  })

/**
 * Atividade por dia, em painel ink: é onde o acid tem contraste para ser
 * traço (14:1; sobre papel não chega a 1,2:1). Subida em acid, com a área
 * embaixo; queda e empate ficam neutros. As duas séries se separam pelo
 * desenho — contínua com área, tracejada sem — e não só pela cor.
 *
 * O SVG estica na largura (`preserveAspectRatio="none"`) e o traço não
 * deforma. Rótulos, pontos e dica são HTML por cima, em porcentagem.
 */
function DailyChart({
  dailyViews,
  dailyWa,
  dailyDir,
  dailyPh,
  viewsChange,
  actionsChange,
  comparisonLabel
}: {
  dailyViews: DailySeries
  dailyWa: DailySeries
  dailyDir: DailySeries
  dailyPh: DailySeries
  viewsChange: number | null
  actionsChange: number | null
  comparisonLabel: string | null
}) {
  const [hovered, setHovered] = useState<number | null>(null)
  if (!dailyViews?.length) return null

  const byDate = (list: DailySeries) =>
    new Map(list?.map((point) => [point.date, point.value]))
  const [wa, dir, ph] = [byDate(dailyWa), byDate(dailyDir), byDate(dailyPh)]
  const days = dailyViews.map(({ date, value }) => ({
    date,
    views: value,
    actions: (wa.get(date) ?? 0) + (dir.get(date) ?? 0) + (ph.get(date) ?? 0)
  }))

  const count = days.length
  const top = niceMax(Math.max(...days.flatMap((d) => [d.views, d.actions])))
  const views = buildSeries(
    days.map((d) => d.views),
    top
  )
  const actions = buildSeries(
    days.map((d) => d.actions),
    top
  )
  const path = (runs: typeof views.runs, part: 'line' | 'area', up?: boolean) =>
    runs
      .filter((run) => up === undefined || run.up === up)
      .map((run) => run[part])
      .join('')

  const totals = [
    {
      label: 'Aberturas',
      total: days.reduce((sum, d) => sum + d.views, 0),
      change: viewsChange,
      sample: 'border-solid'
    },
    {
      label: 'WhatsApp, rota e telefone',
      total: days.reduce((sum, d) => sum + d.actions, 0),
      change: actionsChange,
      sample: 'border-dashed'
    }
  ]

  // Com um dia só não há linha: o ponto fica sempre à vista.
  const active = hovered ?? (count === 1 ? 0 : null)
  const day = active === null ? undefined : days[active]
  const clamp = (index: number) => Math.min(count - 1, Math.max(0, index))
  const pick = (event: PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect()
    setHovered(
      clamp(Math.round(((event.clientX - box.left) / box.width) * (count - 1)))
    )
  }
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') return setHovered(null)
    const step =
      event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0
    if (!step) return
    event.preventDefault()
    setHovered((current) => clamp((current ?? (step > 0 ? -1 : count)) + step))
  }

  // Traço mais fino no celular e em janela longa (12 meses, "Tudo").
  // ponytail: a série longa segue diária; agrupar por semana se ficar densa demais.
  const width =
    count > 60
      ? { thin: 'stroke-[1px]', base: 'stroke-[1.25px]', up: 'stroke-[1.5px]' }
      : {
          thin: 'stroke-[1.5px] sm:stroke-[2px]',
          base: 'stroke-[2px] sm:stroke-[2.5px]',
          up: 'stroke-[2.5px] sm:stroke-[3.5px]'
        }
  const stroke = {
    fill: 'none',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    vectorEffect: 'non-scaling-stroke'
  } as const

  return (
    <div className="onside-panel-ink p-4 sm:p-5" data-chart="daily">
      <h3 className="onside-heading mb-4">Atividade diária</h3>

      <dl className="flex flex-wrap gap-x-10 gap-y-4">
        {totals.map((series) => (
          <div key={series.label}>
            <dt className="flex items-center gap-2 text-[var(--onside-muted-on-ink)] text-xs">
              <span
                className={`w-6 border-[var(--onside-paper)] border-t-2 ${series.sample}`}
                aria-hidden="true"
              />
              {series.label}
            </dt>
            <dd className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[var(--onside-muted-on-ink)] text-xs">
              <span
                className={`onside-display text-4xl tabular-nums ${series.total > 0 ? 'text-[var(--onside-acid)]' : 'text-[var(--onside-paper)]'}`}
              >
                {series.total.toLocaleString('pt-BR')}
              </span>
              {comparisonLabel !== null && (
                <span className="flex items-center gap-1.5">
                  <Change text={formatPctChange(series.change)} /> vs{' '}
                  {comparisonLabel}
                </span>
              )}
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-6 grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 font-[family-name:var(--onside-mono)] text-[10px] text-[var(--onside-muted-on-ink)] tabular-nums">
        <div className="relative w-8" aria-hidden="true">
          {[top, top / 2, 0].map((tick, index) => (
            <span
              key={tick}
              className="-translate-y-1/2 absolute right-0 leading-none"
              style={{ top: `${index * 50}%` }}
            >
              {tick.toLocaleString('pt-BR')}
            </span>
          ))}
        </div>

        {/* Controle deslizante de dia: as setas andam e o leitor de tela lê
            os valores do dia em `aria-valuetext`. */}
        <div
          className="relative h-[200px] touch-pan-y sm:h-[240px]"
          role="slider"
          tabIndex={0}
          aria-label={`Gráfico de atividade diária, de ${shortDay(days[0]?.date ?? '')} a ${shortDay(days[count - 1]?.date ?? '')}`}
          aria-valuemin={0}
          aria-valuemax={count - 1}
          aria-valuenow={active ?? count - 1}
          aria-valuetext={
            day
              ? `${longDay(day.date)}: ${day.views} aberturas, ${day.actions} em WhatsApp, rota e telefone`
              : undefined
          }
          onPointerDown={pick}
          onPointerMove={pick}
          onPointerLeave={(event) => {
            if (event.pointerType === 'mouse') setHovered(null)
          }}
          onBlur={() => setHovered(null)}
          onKeyDown={onKeyDown}
        >
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="absolute inset-0 size-full overflow-visible"
            aria-hidden="true"
          >
            {[0, 50, 100].map((y) => (
              <line
                key={y}
                x1={0}
                x2={100}
                y1={y}
                y2={y}
                stroke="var(--onside-muted-on-ink)"
                strokeOpacity={y === 100 ? 0.9 : 0.3}
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
            ))}
            <path
              data-part="area"
              d={path(views.runs, 'area')}
              fill="var(--onside-paper)"
              fillOpacity={0.07}
            />
            <path
              data-part="area-up"
              d={path(views.runs, 'area', true)}
              fill="var(--onside-acid)"
              fillOpacity={0.3}
            />
            <path
              data-part="actions"
              d={path(actions.runs, 'line', false)}
              stroke="var(--onside-muted-on-ink)"
              className={width.thin}
              strokeDasharray="2 6"
              {...stroke}
            />
            <path
              data-part="actions-up"
              d={path(actions.runs, 'line', true)}
              stroke="var(--onside-acid)"
              className={width.thin}
              strokeDasharray="2 6"
              {...stroke}
            />
            <path
              data-part="views"
              d={path(views.runs, 'line', false)}
              stroke="var(--onside-muted-on-ink)"
              className={width.base}
              {...stroke}
            />
            <path
              data-part="views-up"
              d={path(views.runs, 'line', true)}
              stroke="var(--onside-acid)"
              className={width.up}
              {...stroke}
            />
          </svg>

          {day && active !== null && (
            <>
              <span
                className="pointer-events-none absolute inset-y-0 w-px bg-[var(--onside-paper)] opacity-60"
                style={{ left: `${views.xs[active]}%` }}
                aria-hidden="true"
              />
              <span
                className="-translate-x-1/2 -translate-y-1/2 pointer-events-none absolute size-3 rounded-full border-2 border-[var(--onside-ink)] bg-[var(--onside-paper)]"
                style={{
                  left: `${views.xs[active]}%`,
                  top: `${views.ys[active]}%`
                }}
                aria-hidden="true"
              />
              <span
                className="-translate-x-1/2 -translate-y-1/2 pointer-events-none absolute size-2.5 rotate-45 border-2 border-[var(--onside-ink)] bg-[var(--onside-paper)]"
                style={{
                  left: `${actions.xs[active]}%`,
                  top: `${actions.ys[active]}%`
                }}
                aria-hidden="true"
              />
              <div
                className={`pointer-events-none absolute top-1 z-10 w-max border-[1.5px] border-[var(--onside-ink)] bg-[var(--onside-paper)] px-2.5 py-2 font-[family-name:var(--onside-body)] text-[var(--onside-ink)] text-xs shadow-[4px_4px_0_var(--onside-acid)] ${
                  (views.xs[active] ?? 0) > 50
                    ? '-translate-x-full -ml-3'
                    : 'ml-3'
                }`}
                style={{ left: `${views.xs[active]}%` }}
              >
                <p className="mb-1 font-semibold">{longDay(day.date)}</p>
                <p>
                  Aberturas: <strong>{day.views}</strong>
                </p>
                <p>
                  WhatsApp, rota e telefone: <strong>{day.actions}</strong>
                </p>
              </div>
            </>
          )}
        </div>

        <div />
        <div className="relative mt-2 h-3" aria-hidden="true">
          {tickIndexes(count).map((index, position) => (
            <span
              key={index}
              // No celular ficam só o primeiro, o do meio e o último dia.
              className={`absolute leading-none ${position % 2 ? 'hidden sm:block' : ''} ${
                count > 1 && index === 0
                  ? ''
                  : count > 1 && index === count - 1
                    ? '-translate-x-full'
                    : '-translate-x-1/2'
              }`}
              style={{ left: `${views.xs[index]}%` }}
            >
              {shortDay(days[index]?.date ?? '')}
            </span>
          ))}
        </div>
      </div>

      <p className="mt-4 flex items-center gap-2 text-[var(--onside-muted-on-ink)] text-xs">
        <span className="h-1 w-6 bg-[var(--onside-acid)]" aria-hidden="true" />
        Em verde, os dias em que o número subiu.
      </p>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Action Distribution                                                 */
/* ------------------------------------------------------------------ */

function ActionDistributionView({ data }: { data: AnalyticsOverviewData }) {
  const items: Array<{ label: string; count: number | null }> = [
    { label: 'WhatsApp', count: data.whatsappOpened },
    { label: 'Rota', count: data.directionsOpened },
    { label: 'Telefone', count: data.phoneClicked }
  ]

  const total = items.reduce((s, i) => s + (i.count ?? 0), 0)
  const hasLockedMetric = items.some((item) => item.count === null)
  if (total === 0 && !hasLockedMetric) return null

  const mainAction = hasLockedMetric ? null : getMainAction(data)

  return (
    <div className="onside-panel p-4">
      <SectionHeading metric="channels" />

      {mainAction && (
        <div className="onside-panel-acid mb-3 flex items-center gap-2 px-3 py-2 font-semibold text-sm">
          <Check size={14} color="currentColor" aria-hidden="true" />
          Mais usado: {mainAction}
        </div>
      )}

      <div className="space-y-2">
        {items.map((item) => {
          const pct =
            item.count !== null && total > 0 ? (item.count / total) * 100 : 0
          return (
            <div key={item.label}>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="text-[var(--onside-ink)] opacity-80">
                  {item.label}
                </span>
                <span className="font-medium text-[var(--onside-ink)]">
                  {formatAnalyticsValue(item.count)}
                  {item.count !== null && (
                    <span className="ml-1 text-xs opacity-70">
                      ({pct.toFixed(0)}%)
                    </span>
                  )}
                </span>
              </div>
              <div className="h-3 w-full bg-[var(--onside-stone)]">
                <div
                  // O contorno é só do líder: acid sobre pedra não tem
                  // contraste, e contorno em barra de 0% viraria um risco.
                  className={`h-full ${
                    item.label === mainAction
                      ? 'border-[1.5px] border-[var(--onside-ink)] bg-[var(--onside-acid)]'
                      : 'bg-[var(--onside-ink)]'
                  }`}
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

function PeriodComparison({
  data,
  comparisonLabel
}: {
  data: AnalyticsOverviewData
  comparisonLabel: string
}) {
  if (!hasComparisonData(data)) {
    return (
      <div className="onside-panel p-4">
        <SectionHeading metric="periodComparison" />
        <p className="text-sm text-[var(--onside-ink)] opacity-70">
          Ainda não há dados de {comparisonLabel}. A comparação aparece assim
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
      curr: data.whatsappOpened,
      change: data.whatsappOpenedChange
    },
    {
      label: 'Rota',
      curr: data.directionsOpened,
      change: data.directionsOpenedChange
    },
    {
      label: 'Telefone',
      curr: data.phoneClicked,
      change: data.phoneClickedChange
    }
  ]

  return (
    <div className="onside-panel p-4">
      <SectionHeading metric="periodComparison" />
      {/* Dois por linha: o card divide a largura com "Como te procuraram", e
          o texto de métrica travada pelo plano não cabe em quatro colunas. */}
      <div className="grid grid-cols-2 gap-4">
        {rows.map((r) => (
          <div key={r.label}>
            <p className="text-xs text-[var(--onside-ink)] opacity-60">
              {r.label}
            </p>
            <p className="onside-display text-lg text-[var(--onside-ink)]">
              {formatAnalyticsValue(r.curr)}
            </p>
            <p className="mt-1 text-[var(--onside-muted)] text-xs">
              <Change text={formatPctChange(r.change)} />
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
  showComparison = true,
  planNote,
  noPlan = false,
  onCreateEvent
}: {
  overviewState: AnalyticsOverviewState
  /** `false` no período "Tudo": não existe período anterior (WEB-263). */
  showComparison?: boolean
  /** Por que o plano em vigor não é o contratado (`getShownPlan`, WEB-344). */
  planNote?: string | null
  /** Bar sem assinatura: o Starter de `data.plan` é só o padrão dos limites. */
  noPlan?: boolean
  onCreateEvent?: () => void
}) {
  if (overviewState.status === 'loading') return <OverviewSkeleton />
  if (overviewState.status === 'error' && overviewState.retry)
    return (
      <OverviewError
        message={overviewState.message}
        onRetry={overviewState.retry}
        retryable={overviewState.retryable}
      />
    )

  if (overviewState.status === 'empty') {
    return (
      <section aria-label="Visão geral">
        <h2 className="onside-display mb-4 text-2xl">Desempenho do bar</h2>
        <div className="onside-panel flex flex-col items-center gap-4 p-12 text-center">
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
  const comparisonLabel = showComparison
    ? formatComparisonPeriod(data.from, data.to)
    : null

  return (
    <section aria-label="Visão geral">
      <header className="mb-6 flex items-end justify-between">
        <div>
          <h2 className="onside-display text-2xl">Desempenho do bar</h2>
          <p className="mt-1 text-sm text-[var(--onside-ink)] opacity-60">
            {formatAnalyticsPeriod(data.from, data.to)} •{' '}
            {noPlan ? 'Sem plano' : `Plano: ${getPlan(data.plan).name}`}
            {planNote ? ` • ${planNote}` : null}
          </p>
        </div>
      </header>

      {data.limitations.includes(
        'distinct_counts_are_daily_sums_after_retention'
      ) && (
        <div className="onside-callout onside-callout-warn mb-4" role="note">
          <p className="text-sm">
            Visitantes e interessados de dias já consolidados são somados por
            dia. A mesma pessoa em dias diferentes pode aparecer mais de uma vez
            nessa janela.
          </p>
        </div>
      )}

      <KpiCards data={data} comparisonLabel={comparisonLabel} />
      <ClassicPlacement data={data} comparisonLabel={comparisonLabel} />

      <div className="mt-6 space-y-6">
        <DailyChart
          dailyViews={data.dailyProfileViews}
          dailyWa={data.dailyWhatsappOpened}
          dailyDir={data.dailyDirectionsOpened}
          dailyPh={data.dailyPhoneClicked}
          viewsChange={data.profileViewsChange}
          actionsChange={data.highIntentActionsChange}
          comparisonLabel={comparisonLabel}
        />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ActionDistributionView data={data} />
          {comparisonLabel !== null && (
            <PeriodComparison data={data} comparisonLabel={comparisonLabel} />
          )}
        </div>
      </div>
    </section>
  )
}
