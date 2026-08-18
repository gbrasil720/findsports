import { describe, expect, test } from 'bun:test'
import { buildAnalyticsDemoRows } from './analytics'

const fanIds = Array.from({ length: 60 }, (_, index) => `fan-${index + 1}`)
const anchor = new Date('2026-08-14T18:00:00.000Z')
const demoEvents = [5, 13, 22].map((daysAgo, index) => ({
  id: `event-${index + 1}`,
  championship: `Demo ${index + 1}`,
  participantFreeText: `Time ${index + 1} A × Time ${index + 1} B`,
  startsAt: new Date(anchor.getTime() - daysAgo * 24 * 60 * 60 * 1000)
}))

describe('buildAnalyticsDemoRows', () => {
  test('creates current and previous-period data for meaningful comparisons', () => {
    const rows = buildAnalyticsDemoRows({
      barId: 'bar-1',
      fanIds,
      demoEvents,
      anchor
    })
    const currentStart = new Date('2026-07-15T12:00:00.000Z')
    const previousStart = new Date('2026-06-15T12:00:00.000Z')
    const currentRows = rows.filter((row) => row.occurredAt >= currentStart)
    const previousRows = rows.filter(
      (row) => row.occurredAt >= previousStart && row.occurredAt < currentStart
    )

    expect(currentRows.length).toBeGreaterThan(previousRows.length)
    expect(currentRows.some((row) => row.type === 'profile_view')).toBe(true)
    expect(currentRows.some((row) => row.type === 'whatsapp_opened')).toBe(true)
    expect(currentRows.some((row) => row.type === 'directions_opened')).toBe(
      true
    )
    expect(currentRows.some((row) => row.type === 'phone_clicked')).toBe(true)
  })

  test('associates current-period activity with all demo games', () => {
    const rows = buildAnalyticsDemoRows({
      barId: 'bar-1',
      fanIds,
      demoEvents,
      anchor
    })
    const sourceEventIds = new Set(
      rows.flatMap((row) => (row.sourceEventId ? [row.sourceEventId] : []))
    )

    expect(sourceEventIds).toEqual(new Set(demoEvents.map((event) => event.id)))
  })

  test('respects the database daily deduplication key', () => {
    const rows = buildAnalyticsDemoRows({
      barId: 'bar-1',
      fanIds,
      demoEvents,
      anchor
    })
    const dedupKeys = rows.map((row) =>
      [
        row.barId,
        row.actorUserId,
        row.type,
        row.commercialDay,
        row.sourceEventId ?? 'no-event'
      ].join(':')
    )

    expect(new Set(dedupKeys).size).toBe(dedupKeys.length)
  })
})
