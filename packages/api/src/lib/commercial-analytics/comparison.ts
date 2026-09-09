import {
  type AnalyticsBenchmark,
  type AnalyticsInsight,
  COMPARISON_METRICS,
  type ComparisonMetric,
  type ComparisonMetricValues,
  type EventAnalyticsSnapshot,
  type EventComparisonRank,
  type EventComparisonResult,
  type EventComparisonRow,
  type EventComparisonTarget
} from './types'

const ACTION_METRICS: readonly ComparisonMetric[] = [
  'directionsOpened',
  'phoneClicked',
  'whatsappOpened'
]
const ANOMALY_THRESHOLD_PERCENT = 30

export interface BuildEventComparisonInput {
  mode: 'cross_game' | 'advanced'
  target: EventComparisonTarget
  currentRows: EventAnalyticsSnapshot[]
  historicalRows?: EventAnalyticsSnapshot[]
  metrics?: readonly ComparisonMetric[]
}

function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

function percentChange(current: number, baseline: number): number | null {
  if (baseline === 0) return null
  return round(((current - baseline) / baseline) * 100, 1)
}

function mean(values: number[]): number {
  return values.length === 0
    ? 0
    : values.reduce((sum, value) => sum + value, 0) / values.length
}

function average(values: number[]): number {
  return round(mean(values))
}

function metricValue(
  row: EventAnalyticsSnapshot | EventComparisonRow,
  metric: ComparisonMetric
): number {
  return row[metric] ?? 0
}

function normalizedMetricValue(
  row: EventAnalyticsSnapshot,
  metric: ComparisonMetric
): number {
  return metricValue(row, metric) / Math.max(row.windowHours, 0.25)
}

function hasData(
  row: EventAnalyticsSnapshot,
  metrics: readonly ComparisonMetric[]
): boolean {
  return metrics.some((metric) => metricValue(row, metric) > 0)
}

function conversionRate(values: ComparisonMetricValues): number | null {
  if (values.uniqueVisitors === null || values.uniqueVisitors <= 0) return null

  const visibleActions = ACTION_METRICS.filter(
    (metric) => values[metric] !== null
  )
  if (visibleActions.length === 0) return null

  const actions = visibleActions.reduce(
    (sum, metric) => sum + (values[metric] ?? 0),
    0
  )
  return round((actions / values.uniqueVisitors) * 100, 1)
}

function visibleValues(
  snapshot: EventAnalyticsSnapshot,
  metrics: readonly ComparisonMetric[]
): ComparisonMetricValues {
  const canSee = (metric: ComparisonMetric) => metrics.includes(metric)
  return {
    uniqueVisitors: canSee('uniqueVisitors') ? snapshot.uniqueVisitors : null,
    profileViews: canSee('profileViews') ? snapshot.profileViews : null,
    directionsOpened: canSee('directionsOpened')
      ? snapshot.directionsOpened
      : null,
    phoneClicked: canSee('phoneClicked') ? snapshot.phoneClicked : null,
    whatsappOpened: canSee('whatsappOpened') ? snapshot.whatsappOpened : null
  }
}

function normalizedValues(
  values: ComparisonMetricValues,
  windowHours: number
): ComparisonMetricValues {
  const divisor = Math.max(windowHours, 0.25)
  return {
    uniqueVisitors:
      values.uniqueVisitors === null
        ? null
        : round(values.uniqueVisitors / divisor),
    profileViews:
      values.profileViews === null
        ? null
        : round(values.profileViews / divisor),
    directionsOpened:
      values.directionsOpened === null
        ? null
        : round(values.directionsOpened / divisor),
    phoneClicked:
      values.phoneClicked === null
        ? null
        : round(values.phoneClicked / divisor),
    whatsappOpened:
      values.whatsappOpened === null
        ? null
        : round(values.whatsappOpened / divisor)
  }
}

export function toEventComparisonRow(
  snapshot: EventAnalyticsSnapshot,
  metrics: readonly ComparisonMetric[] = COMPARISON_METRICS
): EventComparisonRow {
  const values = visibleValues(snapshot, metrics)

  return {
    eventId: snapshot.eventId,
    eventName: snapshot.eventName,
    startsAt: snapshot.startsAt,
    windowHours: round(Math.max(snapshot.windowHours, 0.25)),
    ...values,
    normalized: normalizedValues(values, snapshot.windowHours),
    conversionRate: conversionRate(values)
  }
}

/** Rebuild derived values after server-side metric masking. */
export function maskEventComparisonRow(
  row: EventComparisonRow,
  metrics: readonly ComparisonMetric[]
): EventComparisonRow {
  const canSee = (metric: ComparisonMetric) => metrics.includes(metric)
  const values: ComparisonMetricValues = {
    uniqueVisitors: canSee('uniqueVisitors') ? (row.uniqueVisitors ?? 0) : null,
    profileViews: canSee('profileViews') ? (row.profileViews ?? 0) : null,
    directionsOpened: canSee('directionsOpened')
      ? (row.directionsOpened ?? 0)
      : null,
    phoneClicked: canSee('phoneClicked') ? (row.phoneClicked ?? 0) : null,
    whatsappOpened: canSee('whatsappOpened') ? (row.whatsappOpened ?? 0) : null
  }

  return {
    eventId: row.eventId,
    eventName: row.eventName,
    startsAt: row.startsAt,
    windowHours: round(Math.max(row.windowHours, 0.25)),
    ...values,
    normalized: normalizedValues(values, row.windowHours),
    conversionRate: conversionRate(values)
  }
}

function averageComparisonRow(
  rows: EventComparisonRow[],
  metrics: readonly ComparisonMetric[]
): EventComparisonRow {
  const canSee = (metric: ComparisonMetric) => metrics.includes(metric)
  const values: ComparisonMetricValues = {
    uniqueVisitors: canSee('uniqueVisitors')
      ? average(rows.map((row) => metricValue(row, 'uniqueVisitors')))
      : null,
    profileViews: canSee('profileViews')
      ? average(rows.map((row) => metricValue(row, 'profileViews')))
      : null,
    directionsOpened: canSee('directionsOpened')
      ? average(rows.map((row) => metricValue(row, 'directionsOpened')))
      : null,
    phoneClicked: canSee('phoneClicked')
      ? average(rows.map((row) => metricValue(row, 'phoneClicked')))
      : null,
    whatsappOpened: canSee('whatsappOpened')
      ? average(rows.map((row) => metricValue(row, 'whatsappOpened')))
      : null
  }
  const normalized: ComparisonMetricValues = {
    uniqueVisitors: canSee('uniqueVisitors')
      ? average(rows.map((row) => row.normalized.uniqueVisitors ?? 0))
      : null,
    profileViews: canSee('profileViews')
      ? average(rows.map((row) => row.normalized.profileViews ?? 0))
      : null,
    directionsOpened: canSee('directionsOpened')
      ? average(rows.map((row) => row.normalized.directionsOpened ?? 0))
      : null,
    phoneClicked: canSee('phoneClicked')
      ? average(rows.map((row) => row.normalized.phoneClicked ?? 0))
      : null,
    whatsappOpened: canSee('whatsappOpened')
      ? average(rows.map((row) => row.normalized.whatsappOpened ?? 0))
      : null
  }

  return {
    eventId: 'bar-average',
    eventName: 'Média dos demais jogos do bar',
    startsAt: '',
    windowHours: average(rows.map((row) => row.windowHours)),
    ...values,
    normalized,
    conversionRate: conversionRate(values)
  }
}

export function rankEventComparison(
  rows: EventComparisonRow[]
): EventComparisonRank[] {
  return [...rows]
    .sort((left, right) => {
      const leftRate = left.conversionRate ?? -1
      const rightRate = right.conversionRate ?? -1
      if (rightRate !== leftRate) return rightRate - leftRate

      const leftDate = Date.parse(left.startsAt)
      const rightDate = Date.parse(right.startsAt)
      if (rightDate !== leftDate) return rightDate - leftDate
      return left.eventId.localeCompare(right.eventId)
    })
    .map((row, index) => ({
      eventId: row.eventId,
      eventName: row.eventName,
      conversionRate: row.conversionRate,
      rank: index + 1
    }))
}

function emptyComparison(
  mode: 'cross_game' | 'advanced',
  target: EventComparisonTarget,
  emptyReason: 'no_data' | 'not_enough_games' | 'no_baseline'
): EventComparisonResult {
  return {
    mode,
    target,
    status: 'empty',
    emptyReason,
    events: [],
    benchmark: null,
    ranking: [],
    benchmarks: [],
    insights: []
  }
}

function calculateAdvancedBenchmarks(
  currentRows: EventAnalyticsSnapshot[],
  historicalRows: EventAnalyticsSnapshot[],
  metrics: readonly ComparisonMetric[]
): {
  benchmarks: AnalyticsBenchmark[]
  insights: AnalyticsInsight[]
} {
  const benchmarks: AnalyticsBenchmark[] = []
  const insights: AnalyticsInsight[] = []
  const historicalWithData = historicalRows.filter((row) =>
    hasData(row, metrics)
  )

  if (historicalWithData.length === 0) return { benchmarks, insights }

  for (const metric of metrics) {
    const currentValue = mean(
      currentRows.map((row) => normalizedMetricValue(row, metric))
    )
    const baselineValue = mean(
      historicalWithData.map((row) => normalizedMetricValue(row, metric))
    )
    benchmarks.push({
      scope: 'history',
      metric,
      current: round(currentValue),
      baseline: round(baselineValue),
      changePercent: percentChange(currentValue, baselineValue)
    })
  }

  for (const row of currentRows) {
    const sameWeekday = historicalWithData.filter(
      (historical) => historical.weekday === row.weekday
    )
    if (sameWeekday.length === 0) continue

    for (const metric of metrics) {
      const current = normalizedMetricValue(row, metric)
      const baselineValue = mean(
        sameWeekday.map((historical) =>
          normalizedMetricValue(historical, metric)
        )
      )
      const baseline = round(baselineValue)
      const change = percentChange(current, baselineValue)
      benchmarks.push({
        scope: 'weekday',
        metric,
        current,
        baseline,
        changePercent: change,
        eventId: row.eventId,
        weekday: row.weekday
      })

      if (change !== null && Math.abs(change) >= ANOMALY_THRESHOLD_PERCENT) {
        insights.push({
          kind: 'anomaly',
          scope: 'weekday',
          metric,
          eventId: row.eventId,
          eventName: row.eventName,
          weekday: row.weekday,
          value: current,
          baseline,
          changePercent: change
        })
      }
    }
  }

  return { benchmarks, insights }
}

export function buildEventComparison({
  mode,
  target,
  currentRows,
  historicalRows = [],
  metrics = COMPARISON_METRICS
}: BuildEventComparisonInput): EventComparisonResult {
  const rowsWithData = currentRows.filter((row) => hasData(row, metrics))
  const byId = new Map(currentRows.map((row) => [row.eventId, row]))

  let selected: EventAnalyticsSnapshot[]
  let benchmark: EventComparisonRow | null = null

  if (target.type === 'events') {
    selected = [...new Set(target.eventIds)]
      .map((eventId) => byId.get(eventId))
      .filter((row): row is EventAnalyticsSnapshot => Boolean(row))
      .filter((row) => hasData(row, metrics))

    if (selected.length === 0) return emptyComparison(mode, target, 'no_data')
    if (selected.length < 2) {
      return emptyComparison(mode, target, 'not_enough_games')
    }
  } else {
    const targetRow = byId.get(target.eventId)
    if (!targetRow || !hasData(targetRow, metrics)) {
      return emptyComparison(mode, target, 'no_data')
    }

    const otherRows = rowsWithData.filter(
      (row) => row.eventId !== targetRow.eventId
    )
    if (otherRows.length === 0) {
      return emptyComparison(mode, target, 'no_baseline')
    }

    selected = [targetRow]
    benchmark = averageComparisonRow(
      otherRows.map((row) => toEventComparisonRow(row, metrics)),
      metrics
    )
  }

  const events = selected.map((row) => toEventComparisonRow(row, metrics))
  const advanced =
    mode === 'advanced'
      ? calculateAdvancedBenchmarks(selected, historicalRows, metrics)
      : { benchmarks: [], insights: [] }

  return {
    mode,
    target,
    status: 'ready',
    events,
    benchmark,
    ranking: rankEventComparison(events),
    benchmarks: advanced.benchmarks,
    insights: advanced.insights
  }
}
