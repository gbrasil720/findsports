import { describe, expect, test } from 'bun:test'
import {
  formatComparisonPeriod,
  getAnalyticsRange,
  getAvailableAnalyticsPeriods,
  getPeriodDays
} from './analytics-period'

const now = new Date('2026-09-08T12:00:00.000Z')

describe('analytics period selector', () => {
  test('builds the advertised calendar windows', () => {
    expect(getAnalyticsRange('30d', now)).toEqual({
      from: '2026-08-10',
      to: '2026-09-08'
    })
    expect(getAnalyticsRange('12m', now)).toEqual({
      from: '2025-09-09',
      to: '2026-09-08'
    })
    expect(getAnalyticsRange('all', now)).toEqual({
      from: '1970-01-01',
      to: '2026-09-08'
    })
  })

  test('exposes only shortcuts allowed by the server entitlement', () => {
    expect(getAvailableAnalyticsPeriods(30).map((item) => item.id)).toEqual([
      '30d'
    ])
    expect(getAvailableAnalyticsPeriods(365).map((item) => item.id)).toEqual([
      '30d',
      '12m'
    ])
    expect(getAvailableAnalyticsPeriods(null).map((item) => item.id)).toEqual([
      '30d',
      '12m',
      'all'
    ])
  })

  test('derives comparison copy from the effective range', () => {
    expect(getPeriodDays('2026-08-10', '2026-09-08')).toBe(30)
    expect(formatComparisonPeriod('2026-08-10', '2026-09-08')).toBe(
      '30 dias anteriores'
    )
    expect(formatComparisonPeriod('2026-09-08', '2026-09-08')).toBe(
      '1 dia anterior'
    )
  })
})
