const DAY_MS = 24 * 60 * 60 * 1000
const COMMERCIAL_TIME_ZONE = 'America/Sao_Paulo'

export type AnalyticsPeriodPreset = '30d' | '12m' | 'all' | 'custom'

export type AnalyticsDateRange = {
  from: string
  to: string
}

export const ANALYTICS_PERIOD_OPTIONS = [
  { id: '30d', label: '30 dias', maxDays: 30 },
  { id: '12m', label: '12 meses', maxDays: 365 },
  { id: 'all', label: 'Tudo', maxDays: null }
] as const

const commercialDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: COMMERCIAL_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
})

export function toCommercialDate(date: Date): string {
  return commercialDateFormatter.format(date)
}

function shiftDate(date: string, days: number): string {
  const shifted = new Date(`${date}T12:00:00.000Z`)
  shifted.setUTCDate(shifted.getUTCDate() + days)
  return shifted.toISOString().slice(0, 10)
}

export function getAnalyticsRange(
  preset: Exclude<AnalyticsPeriodPreset, 'custom'>,
  now = new Date()
): AnalyticsDateRange {
  const to = toCommercialDate(now)

  switch (preset) {
    case '30d':
      return { from: shiftDate(to, -29), to }
    case '12m':
      return { from: shiftDate(to, -364), to }
    case 'all':
      return { from: '1970-01-01', to }
  }
}

export function getAvailableAnalyticsPeriods(maxDaysRetention: number | null) {
  return ANALYTICS_PERIOD_OPTIONS.filter(
    (option) =>
      maxDaysRetention === null ||
      (option.maxDays !== null && option.maxDays <= maxDaysRetention)
  )
}

export function getPeriodDays(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00.000Z`)
  const end = Date.parse(`${to}T00:00:00.000Z`)
  return Math.max(1, Math.round((end - start) / DAY_MS) + 1)
}

export function formatAnalyticsPeriod(from: string, to: string): string {
  const format = (date: string) =>
    new Date(`${date}T12:00:00.000Z`).toLocaleDateString('pt-BR', {
      timeZone: 'UTC',
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    })
  return `${format(from)} — ${format(to)}`
}

export function formatComparisonPeriod(from: string, to: string): string {
  const days = getPeriodDays(from, to)
  return days === 1 ? '1 dia anterior' : `${days} dias anteriores`
}
