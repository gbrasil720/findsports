import { useIsFetching, useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { type KeyboardEvent, type PointerEvent, useState } from 'react'
import {
  type AnalyticsOverviewData,
  type EventAnalyticsState,
  getInterestRate,
  getMainAction
} from '@/components/admin/admin-model'
import {
  useMyAnalyticsEntitlements,
  useMyBar,
  useMyEvents,
  useMySubscription
} from '@/components/admin/admin-queries'
import {
  type AnalyticsPeriodPreset,
  getAnalyticsRange,
  getAvailableAnalyticsPeriods,
  getPeriodDays
} from '@/components/admin/analytics-period'
import { MetricHint } from '@/components/admin/metric-hint'
import { Arrow } from '@/components/landing/v3/icons'
import { getShownPlan } from '@/lib/lapsed-plan'
import { getPlan } from '@/lib/plan-catalog'
import { getUserFacingMessage, isRetryableError } from '@/lib/user-facing-error'
import { useTRPC } from '@/utils/trpc'
import { ComoCadaJogo } from './como-cada-jogo'
import { isDraft, useEventAnalytics, useHashScroll } from './dados'
import { dayLabel } from './noite'
import { usePainel } from './painel-shell'

/*
 * Desempenho (WEB-501, fase 3; protótipo `desempenho`, `bigChart`,
 * `wireChart`): o período, os três números, a atividade diária, quem foi
 * pela Onside, os canais, cada jogo (com "Comparar jogos") e a entrega nos
 * clássicos. O que o plano não vê vem nulo do servidor e vira uma frase.
 */

const fmt = (n: number) => n.toLocaleString('pt-BR')

/** "+13%", "−4 p.p.", ou `null` sem base. */
export function changeText(
  value: number | null | undefined,
  unit: '%' | 'p.p.' = '%'
): string | null {
  if (value === null || value === undefined || !Number.isFinite(value))
    return null
  const sign = value > 0 ? '+' : value < 0 ? '−' : ''
  const abs = Math.abs(value).toLocaleString('pt-BR', {
    maximumFractionDigits: 1
  })
  return `${sign}${abs}${unit === '%' ? '%' : ' p.p.'}`
}

/** Alta em acid; queda e empate neutros. */
const deltaClass = (text: string) =>
  text.startsWith('+') ? undefined : 'is-down'

function Delta({
  value,
  unit,
  vs
}: {
  value: number | null | undefined
  unit?: '%' | 'p.p.'
  vs: string | null
}) {
  const text = vs ? changeText(value, unit) : null
  if (!text) return null
  return (
    <span className="pn-delta">
      <em className={deltaClass(text)}>{text}</em>
      <span>{vs}</span>
    </span>
  )
}

export const rateText = (rate: number | null) =>
  rate === null
    ? '—'
    : `${(rate * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`

/** "7 out — 5 nov 2026". */
function periodLabel(from: string, to: string): string {
  const part = (date: string, year: boolean) =>
    new Date(`${date}T12:00:00.000Z`)
      .toLocaleDateString('pt-BR', {
        timeZone: 'UTC',
        day: 'numeric',
        month: 'short',
        ...(year ? { year: 'numeric' } : {})
      })
      .replace(/\./g, '')
      .replace(/ de /g, ' ')
  const sameYear = from.slice(0, 4) === to.slice(0, 4)
  return from === to
    ? part(to, true)
    : `${part(from, !sameYear)} — ${part(to, true)}`
}

function versus(from: string, to: string): string {
  const days = getPeriodDays(from, to)
  return days === 1 ? 'vs o dia antes' : `vs ${days} dias antes`
}

function ErroBloco({
  error,
  fallback,
  retry
}: {
  error: unknown
  fallback: string
  retry: () => void
}) {
  return (
    <div className="pn-aviso is-error" role="alert">
      <div className="pn-aviso-t">
        <b>{getUserFacingMessage(error, fallback)}</b>
      </div>
      {isRetryableError(error) ? (
        <button type="button" className="pn-btn pn-ghost pn-sm" onClick={retry}>
          Tentar novamente
        </button>
      ) : null}
    </div>
  )
}

export function DesempenhoPage() {
  const trpc = useTRPC()
  const {
    analyticsRange: range,
    setAnalyticsRange,
    analyticsPreset: preset,
    setAnalyticsPreset
  } = usePainel()
  const { data: bar } = useMyBar()
  const events = useMyEvents()
  const sub = useMySubscription()
  const entitlements = useMyAnalyticsEntitlements()
  const overview = useQuery({
    ...trpc.commercialAnalytics.getMyAnalyticsOverview.queryOptions(range),
    meta: { errorToast: false }
  })
  const analytics = useEventAnalytics(
    range,
    (events.data ?? []).filter((e) => !isDraft(e))
  )
  const fetchingEvents =
    useIsFetching(trpc.commercialAnalytics.getMyEventAnalytics.pathFilter()) > 0
  useHashScroll(overview.isSuccess && analytics.state.status !== 'loading')

  const [custom, setCustom] = useState(range)
  const [customError, setCustomError] = useState<string | null>(null)

  const periods = entitlements.data
    ? getAvailableAnalyticsPeriods(entitlements.data.maxDaysRetention)
    : []
  const choose = (next: AnalyticsPeriodPreset) => {
    setCustomError(null)
    if (next === 'custom') return setAnalyticsPreset(next)
    if (!periods.some((option) => option.id === next)) return
    setAnalyticsRange(
      getAnalyticsRange(
        next,
        new Date(),
        bar ? new Date(bar.createdAt) : undefined
      )
    )
    setAnalyticsPreset(next)
  }
  const applyCustom = () => {
    if (!custom.from || !custom.to)
      return setCustomError('Informe as duas datas do período.')
    if (custom.from > custom.to)
      return setCustomError(
        'A data inicial deve ser anterior ou igual à data final.'
      )
    setAnalyticsRange(custom)
    setAnalyticsPreset('custom')
  }

  const d = overview.data
  const subscription = sub.data
  const planKnown = sub.isFetched && !sub.isLoading && !sub.isError
  const shown = planKnown ? getShownPlan(subscription) : null
  const planLabel = d
    ? [
        planKnown && !subscription
          ? 'Sem plano'
          : `Plano ${getPlan(d.plan).name}`,
        shown?.note
      ]
        .filter(Boolean)
        .join(' · ')
    : null
  // "Tudo" não tem período anterior (WEB-263).
  const vs = d && preset !== 'all' ? versus(d.from, d.to) : null

  return (
    <>
      <header className="pn-head">
        <div>
          <p className="pn-k">
            {periodLabel(range.from, range.to)}
            {planLabel ? ` · ${planLabel}` : null}
          </p>
          <h1 className="pn-disp">Desempenho</h1>
        </div>
        <section
          className="pn-per"
          aria-label="Período das analytics"
          aria-busy={entitlements.isLoading || overview.isFetching}
        >
          {entitlements.isError ? (
            <ErroBloco
              error={entitlements.error}
              fallback="Não foi possível carregar os períodos disponíveis."
              retry={() => void entitlements.refetch()}
            />
          ) : (
            <fieldset className="pn-tabs" aria-label="Período">
              {periods.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={preset === option.id}
                  onClick={() => choose(option.id)}
                >
                  {option.label}
                </button>
              ))}
              {entitlements.data ? (
                <button
                  type="button"
                  aria-pressed={preset === 'custom'}
                  onClick={() => choose('custom')}
                >
                  Personalizado
                </button>
              ) : null}
            </fieldset>
          )}
          <p className="pn-hint">
            {entitlements.data
              ? entitlements.data.maxDaysRetention === null
                ? 'Seu plano permite todo o histórico disponível.'
                : `Seu plano permite até ${entitlements.data.maxDaysRetention} dias.`
              : entitlements.isLoading
                ? 'Carregando os períodos…'
                : null}
            {overview.isFetching || fetchingEvents ? (
              <span role="status"> Atualizando…</span>
            ) : null}
          </p>
        </section>
      </header>

      {preset === 'custom' ? (
        <form
          method="post"
          className="pn-card pn-custom"
          onSubmit={(event) => {
            event.preventDefault()
            applyCustom()
          }}
        >
          <label className="pn-fl">
            <span className="pn-fl-l">De</span>
            <input
              type="date"
              className="pn-inp"
              aria-label="Data inicial"
              value={custom.from}
              onChange={(event) => {
                setCustom({ ...custom, from: event.target.value })
                setCustomError(null)
              }}
            />
          </label>
          <label className="pn-fl">
            <span className="pn-fl-l">Até</span>
            <input
              type="date"
              className="pn-inp"
              aria-label="Data final"
              value={custom.to}
              onChange={(event) => {
                setCustom({ ...custom, to: event.target.value })
                setCustomError(null)
              }}
            />
          </label>
          <button type="submit" className="pn-btn pn-ink pn-sm">
            Consultar período
          </button>
          {customError ? (
            <p className="pn-ferr" role="alert">
              {customError}
            </p>
          ) : null}
        </form>
      ) : null}

      {overview.isLoading ? (
        <div className="pn-skel pn-big3-skel" role="status" aria-busy="true">
          <span className="sr-only">Carregando desempenho do bar…</span>
          <i />
          <i />
          <i />
        </div>
      ) : overview.isError || !d ? (
        <div className="pn-avisos">
          <ErroBloco
            error={overview.error}
            fallback="Não foi possível carregar as métricas. Tente novamente."
            retry={() => void overview.refetch()}
          />
        </div>
      ) : (
        <Numeros data={d} vs={vs} games={analytics.state} />
      )}

      <section
        id="como-cada-jogo"
        className="pn-card pn-sec"
        aria-labelledby="pn-ccj-t"
      >
        <ComoCadaJogo state={analytics.state} titleId="pn-ccj-t" />
      </section>

      {d ? <Classicos data={d} vs={vs} /> : null}
    </>
  )
}

function Numeros({
  data: d,
  vs,
  games
}: {
  data: AnalyticsOverviewData
  vs: string | null
  games: EventAnalyticsState
}) {
  const rate = getInterestRate(d.interestedPeople, d.uniqueVisitors)
  const prevRate =
    d.interestedPeoplePrev !== null && d.uniqueVisitorsPrev
      ? getInterestRate(d.interestedPeoplePrev, d.uniqueVisitorsPrev)
      : null
  const views = changeText(d.profileViewsChange)

  return (
    <>
      {d.limitations.includes(
        'distinct_counts_are_daily_sums_after_retention'
      ) ? (
        <p className="pn-aviso is-warn pn-limit-note" role="note">
          Visitantes e interessados de dias já consolidados são somados por dia.
          A mesma pessoa em dias diferentes pode aparecer mais de uma vez nessa
          janela.
        </p>
      ) : null}

      <section className="pn-big3" aria-label="Resumo do período">
        <div>
          <span className="pn-l">
            Pessoas que viram seu bar
            <MetricHint metric="reach" />
          </span>
          <b>{fmt(d.uniqueVisitors)}</b>
          <p>
            abriram {fmt(d.profileViews)}{' '}
            {d.profileViews === 1 ? 'vez' : 'vezes'} a página do bar
            {vs && views ? ` · ${views} nas aberturas` : null}
          </p>
          <Delta value={d.uniqueVisitorsChange} vs={vs} />
        </div>
        <div>
          <span className="pn-l">
            Se interessaram
            <MetricHint metric="interest" />
          </span>
          <b>{fmt(d.interestedPeople)}</b>
          <p>tocaram em WhatsApp, rota ou telefone</p>
          <Delta value={d.interestedPeopleChange} vs={vs} />
        </div>
        <div>
          <span className="pn-l">
            Taxa de interesse
            <MetricHint metric="interestRate" />
          </span>
          <b>{rateText(rate)}</b>
          <p>de quem viu o bar, quantos quiseram ir</p>
          <Delta
            value={
              rate !== null && prevRate !== null
                ? Math.round((rate - prevRate) * 1000) / 10
                : null
            }
            unit="p.p."
            vs={vs}
          />
        </div>
      </section>

      <Atividade data={d} vs={vs} />

      <div className="pn-duo">
        <QuemFoi state={games} />
        <Canais data={d} vs={vs} />
      </div>
    </>
  )
}

/* ─── Atividade diária ─── */

type Dia = { date: string; views: number; actions: number }

/** As aberturas por dia e, no mesmo dia, WhatsApp, rota e telefone somados. */
export function dailySeries(d: {
  dailyProfileViews: { date: string; value: number }[] | null
  dailyWhatsappOpened: { date: string; value: number }[] | null
  dailyDirectionsOpened: { date: string; value: number }[] | null
  dailyPhoneClicked: { date: string; value: number }[] | null
}): Dia[] | null {
  if (!d.dailyProfileViews) return null
  const byDate = (list: { date: string; value: number }[] | null) =>
    new Map(list?.map((point) => [point.date, point.value]))
  const series = [
    byDate(d.dailyWhatsappOpened),
    byDate(d.dailyDirectionsOpened),
    byDate(d.dailyPhoneClicked)
  ]
  return d.dailyProfileViews.map(({ date, value }) => ({
    date,
    views: value,
    actions: series.reduce((sum, map) => sum + (map.get(date) ?? 0), 0)
  }))
}

/** Curva do protótipo (`smooth`): passa por todos os pontos. */
function smooth(points: [number, number][]): string {
  const [first] = points
  if (!first) return ''
  let d = `M${first[0].toFixed(1)} ${first[1].toFixed(1)}`
  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i] as [number, number]
    const p0 = points[i - 1] ?? p1
    const p2 = points[i + 1] as [number, number]
    const p3 = points[i + 2] ?? p2
    const t = 0.18
    d += ` C${(p1[0] + (p2[0] - p0[0]) * t).toFixed(1)} ${(p1[1] + (p2[1] - p0[1]) * t).toFixed(1)} ${(p2[0] - (p3[0] - p1[0]) * t).toFixed(1)} ${(p2[1] - (p3[1] - p1[1]) * t).toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`
  }
  return d
}

/** "11/10". */
const shortDay = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}`

/** "dom, 1 nov". */
const longDay = dayLabel

/** Teto redondo da escala, para a régua de cima sair num número limpo. */
function niceTop(max: number): number {
  if (max <= 4) return 4
  const power = 10 ** Math.floor(Math.log10(max))
  return (
    [1, 2, 2.5, 4, 5, 6, 8, 10].map((m) => m * power).find((v) => v >= max) ??
    10 * power
  )
}

const W = 900
const H = 260
const BASE = 24
const TOP = 16

function Atividade({
  data: d,
  vs
}: {
  data: AnalyticsOverviewData
  vs: string | null
}) {
  const [show, setShow] = useState({ views: true, actions: true })
  const [hover, setHover] = useState<number | null>(null)
  const days = dailySeries(d)

  if (!days) {
    return (
      <section className="pn-card pn-sec" aria-labelledby="pn-atv-t">
        <div className="pn-chd">
          <h3 id="pn-atv-t">Atividade diária</h3>
          <small>só no Elite</small>
        </div>
        <p className="pn-note">
          A atividade dia a dia (aberturas da página, WhatsApp, rota e telefone)
          é do plano Elite. Os totais do período estão acima.
        </p>
        <Link to="/plan" search={{ origin: 'admin' }} className="pn-go">
          Ver planos <Arrow size={16} />
        </Link>
      </section>
    )
  }

  const count = days.length
  const totalViews = days.reduce((sum, day) => sum + day.views, 0)
  const totalActions = days.reduce((sum, day) => sum + day.actions, 0)
  const top = niceTop(
    Math.max(...days.flatMap((day) => [day.views, day.actions]))
  )
  const x = (i: number) => (count === 1 ? W / 2 : (i / (count - 1)) * W)
  const y = (v: number) => H - BASE - (v / top) * (H - BASE - TOP)
  const views = smooth(days.map((day, i) => [x(i), y(day.views)]))
  const actions = smooth(days.map((day, i) => [x(i), y(day.actions)]))
  const active = hover ?? (count === 1 ? 0 : null)
  const day = active === null ? undefined : days[active]
  const clamp = (i: number) => Math.min(count - 1, Math.max(0, i))
  const pick = (event: PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect()
    const f = (event.clientX - box.left) / box.width
    setHover(clamp(Math.round(f * (count - 1))))
  }
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') return setHover(null)
    const step =
      event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0
    if (!step) return
    event.preventDefault()
    setHover((current) => clamp((current ?? (step > 0 ? -1 : count)) + step))
  }
  const ticks = [
    ...new Set([0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(f * (count - 1))))
  ]
  const pct = (i: number) => (count === 1 ? 50 : (i / (count - 1)) * 100)
  const viewsChange = vs ? changeText(d.profileViewsChange) : null
  const actionsChange = vs ? changeText(d.highIntentActionsChange) : null

  return (
    <section className="pn-card pn-sec" aria-labelledby="pn-atv-t">
      <div className="pn-chd">
        <h3 id="pn-atv-t">Atividade diária</h3>
        <small>passe o mouse ou toque para ver o dia</small>
      </div>
      <div className="pn-legend">
        <button
          type="button"
          aria-pressed={show.views}
          onClick={() => setShow({ ...show, views: !show.views })}
        >
          <i />
          <span>
            <b>{fmt(totalViews)}</b>
            <small>aberturas{viewsChange ? ` · ${viewsChange}` : ''}</small>
          </span>
        </button>
        <button
          type="button"
          aria-pressed={show.actions}
          onClick={() => setShow({ ...show, actions: !show.actions })}
        >
          <i className="is-d" />
          <span>
            <b>{fmt(totalActions)}</b>
            <small>
              WhatsApp, rota e telefone
              {actionsChange ? ` · ${actionsChange}` : ''}
            </small>
          </span>
        </button>
      </div>
      {/* Controle deslizante de dia: as setas andam e o leitor de tela lê o
          dia em `aria-valuetext`. */}
      <div
        className="pn-chartbox"
        role="slider"
        tabIndex={0}
        aria-label={`Atividade diária, de ${shortDay(days[0]?.date ?? '')} a ${shortDay(days[count - 1]?.date ?? '')}`}
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
          if (event.pointerType === 'mouse') setHover(null)
        }}
        onBlur={() => setHover(null)}
        onKeyDown={onKeyDown}
      >
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="pn-gB" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#c9f135" stopOpacity=".75" />
              <stop offset="1" stopColor="#c9f135" stopOpacity=".04" />
            </linearGradient>
          </defs>
          {[0, 0.25, 0.5, 0.75, 1].map((f) => (
            <line
              key={f}
              x1="0"
              x2={W}
              y1={H - BASE - f * (H - BASE - TOP)}
              y2={H - BASE - f * (H - BASE - TOP)}
              stroke="var(--line)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {show.views && count > 1 ? (
            <>
              <path
                d={`${views} L${W} ${H - BASE} L0 ${H - BASE} Z`}
                fill="url(#pn-gB)"
              />
              <path
                d={views}
                fill="none"
                stroke="var(--chart-line)"
                strokeWidth="2.5"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            </>
          ) : null}
          {show.actions && count > 1 ? (
            <path
              d={actions}
              fill="none"
              stroke="var(--fg)"
              strokeWidth="2"
              strokeDasharray="6 5"
              strokeLinecap="round"
              opacity=".7"
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
          {active !== null ? (
            <line
              x1={x(active)}
              x2={x(active)}
              y1={10}
              y2={H - BASE}
              stroke="var(--fg)"
              strokeWidth="1"
              opacity=".5"
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
        </svg>
        <span className="pn-ytop" aria-hidden="true">
          {fmt(top)}
        </span>
        {day && active !== null ? (
          <>
            {show.views ? (
              <span
                className="pn-dot"
                style={{
                  left: `${pct(active)}%`,
                  top: `${(y(day.views) / H) * 100}%`
                }}
                aria-hidden="true"
              />
            ) : null}
            {show.actions ? (
              <span
                className="pn-dot is-d"
                style={{
                  left: `${pct(active)}%`,
                  top: `${(y(day.actions) / H) * 100}%`
                }}
                aria-hidden="true"
              />
            ) : null}
            <div
              className="pn-tip"
              style={{
                left: `${Math.min(88, Math.max(12, pct(active)))}%`
              }}
              aria-hidden="true"
            >
              {longDay(day.date)}
              <br />
              {day.views} {day.views === 1 ? 'abertura' : 'aberturas'}
              <br />
              {day.actions} {day.actions === 1 ? 'contato' : 'contatos'}
            </div>
          </>
        ) : null}
      </div>
      <div className="pn-axis" aria-hidden="true">
        {ticks.map((i, n) => (
          <span key={i} className={n % 2 ? 'pn-axis-odd' : undefined}>
            {shortDay(days[i]?.date ?? '')}
          </span>
        ))}
      </div>
    </section>
  )
}

/* ─── Quem foi pela Onside ─── */

function QuemFoi({ state }: { state: EventAnalyticsState }) {
  const { elite } = usePainel()
  const rows = state.status === 'ready' ? state.items : []
  const known = rows.some((row) => row.reservedPeople !== null)
  const marked = rows.reduce((sum, row) => sum + (row.reservedPeople ?? 0), 0)
  const arrived = rows.reduce((sum, row) => sum + (row.arrivals ?? 0), 0)
  const share = marked ? Math.round((arrived / marked) * 100) : null

  return (
    <section className="pn-card" aria-labelledby="pn-qfo-t">
      <div className="pn-chd">
        <h3 id="pn-qfo-t">Quem foi pela Onside</h3>
        {share !== null ? <small>{share}% chegaram ao bar</small> : null}
      </div>
      {state.status === 'loading' ? (
        <p className="pn-note">Carregando…</p>
      ) : known || (elite && state.status === 'empty') ? (
        <>
          <div className="pn-funnel">
            <div>
              <b>{fmt(marked)}</b>
              <span>marcaram que iam</span>
            </div>
            <span className="pn-arrow" aria-hidden="true">
              <Arrow size={22} />
            </span>
            <div>
              <b>{fmt(arrived)}</b>
              <span>validaram no balcão</span>
            </div>
          </div>
          <div className="pn-prog" aria-hidden="true">
            <i style={{ width: `${share ?? 0}%` }} />
          </div>
          <p className="pn-note">
            Quem marcou “Vou assistir aqui” e quem mostrou o código, nos jogos
            do período. Não entram na taxa de interesse.
          </p>
        </>
      ) : state.status === 'error' ? (
        <p className="pn-note">
          Não foi possível carregar os jogos do período.
        </p>
      ) : (
        <>
          <p className="pn-note">
            Quem marcou “Vou assistir aqui” e quem validou o código no balcão é
            do plano Elite: o código e a oferta da casa saem só nele.
          </p>
          <Link to="/plan" search={{ origin: 'admin' }} className="pn-go">
            Ver planos <Arrow size={16} />
          </Link>
        </>
      )}
    </section>
  )
}

/* ─── Como te procuraram ─── */

function Canais({
  data: d,
  vs
}: {
  data: AnalyticsOverviewData
  vs: string | null
}) {
  const items = [
    {
      label: 'WhatsApp',
      count: d.whatsappOpened,
      change: d.whatsappOpenedChange
    },
    {
      label: 'Rota',
      count: d.directionsOpened,
      change: d.directionsOpenedChange
    },
    { label: 'Telefone', count: d.phoneClicked, change: d.phoneClickedChange }
  ]
  const locked = items.some((item) => item.count === null)
  const total = items.reduce((sum, item) => sum + (item.count ?? 0), 0)
  const main = locked ? '—' : getMainAction(d)
  const topShare = Math.max(
    ...items.map((item) => (total ? (item.count ?? 0) / total : 0))
  )

  return (
    <section className="pn-card" aria-labelledby="pn-ctp-t">
      <div className="pn-chd">
        <h3 id="pn-ctp-t">
          Como te procuraram
          <MetricHint metric="channels" />
        </h3>
        {main !== '—' ? <small>mais usado: {main}</small> : null}
      </div>
      {locked ? (
        <>
          <p className="pn-note">
            WhatsApp, rota e telefone, canal a canal, são do Pro e do Elite. No
            seu plano o painel conta as aberturas da página.
          </p>
          <Link to="/plan" search={{ origin: 'admin' }} className="pn-go">
            Ver planos <Arrow size={16} />
          </Link>
        </>
      ) : total === 0 ? (
        <p className="pn-note">
          Ninguém tocou em WhatsApp, rota ou telefone no período.
        </p>
      ) : (
        <div className="pn-hbars">
          {items.map((item) => {
            const share = (item.count ?? 0) / total
            const change = vs ? changeText(item.change) : null
            return (
              <div
                key={item.label}
                className={`pn-hb${item.label === main ? ' is-top' : ''}`}
              >
                <div className="pn-hb-t">
                  <span>
                    {item.label}
                    {change ? (
                      <em className={deltaClass(change)}>{change}</em>
                    ) : null}
                  </span>
                  <span>
                    <b>{fmt(item.count ?? 0)}</b>{' '}
                    <span className="pn-hb-p">{Math.round(share * 100)}%</span>
                  </span>
                </div>
                <div className="pn-hb-tr" aria-hidden="true">
                  <i
                    style={{
                      width: `${topShare ? (share / topShare) * 100 : 0}%`
                    }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

/* ─── Entrega nos clássicos ─── */

function Classicos({
  data: d,
  vs
}: {
  data: AnalyticsOverviewData
  vs: string | null
}) {
  const locked = d.classicExposures === null || d.classicClicks === null
  const ctr =
    !locked && d.classicExposures
      ? rateText((d.classicClicks ?? 0) / d.classicExposures)
      : '—'
  // Sem clássico no período, "0%" de variação não diz nada.
  const happened = !!d.classicExposures
  const exp = vs && happened ? changeText(d.classicExposuresChange) : null
  const clicks = vs && happened ? changeText(d.classicClicksChange) : null

  return (
    <section className="pn-card pn-sec" aria-labelledby="pn-eec-t">
      <div className="pn-chd">
        <h3 id="pn-eec-t">
          Entrega nos clássicos <span className="pn-elite">ELITE</span>
        </h3>
        {!locked && vs && happened ? <small>{vs}</small> : null}
      </div>
      {locked ? (
        <>
          <p className="pn-note">
            Em clássico, o Elite aparece primeiro para quem procura o jogo perto
            do bar. Aqui fica quantas vezes o bar ficou no topo e quantos
            abriram a página a partir dali.
          </p>
          <Link to="/plan" search={{ origin: 'admin' }} className="pn-go">
            Ver planos <Arrow size={16} />
          </Link>
        </>
      ) : (
        <>
          <div className="pn-nums">
            <div>
              <b>{fmt(d.classicExposures ?? 0)}</b>
              <span>vezes no topo em jogo grande</span>
              {exp ? <em className={deltaClass(exp)}>{exp}</em> : null}
            </div>
            <div>
              <b>{fmt(d.classicClicks ?? 0)}</b>
              <span>abriram o bar a partir do topo</span>
              {clicks ? <em className={deltaClass(clicks)}>{clicks}</em> : null}
            </div>
            <div>
              <b>{ctr}</b>
              <span>taxa de clique</span>
            </div>
          </div>
          <p className="pn-note">
            Em clássico, o Elite aparece primeiro para quem procura o jogo perto
            do bar.
            {d.classicExposures === 0
              ? ' Ainda não houve clássico no período.'
              : null}
          </p>
        </>
      )}
    </section>
  )
}
