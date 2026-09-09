import { describe, expect, test } from 'bun:test'
import { TRPCError } from '@trpc/server'

import {
  analyticsDateSchema,
  comparisonTargetSchema,
  parseAnalyticsRange
} from './commercial-analytics'

describe('parseAnalyticsRange', () => {
  test('expands date-only bounds to full commercial days in São Paulo', () => {
    expect(
      parseAnalyticsRange({ from: '2026-09-01', to: '2026-09-30' })
    ).toEqual({
      from: new Date('2026-09-01T03:00:00.000Z'),
      to: new Date('2026-10-01T02:59:59.999Z'),
      periodDays: 30
    })
  })

  test('preserves explicit instants and accepts timezone offsets', () => {
    const input = {
      from: '2026-09-01T10:00:00-03:00',
      to: '2026-09-02T10:00:00-03:00'
    }

    expect(analyticsDateSchema.safeParse(input.from).success).toBe(true)
    expect(parseAnalyticsRange(input)).toEqual({
      from: new Date('2026-09-01T13:00:00.000Z'),
      to: new Date('2026-09-02T13:00:00.000Z'),
      periodDays: 1
    })
  })

  test('rejects impossible dates and inverted ranges', () => {
    expect(analyticsDateSchema.safeParse('2026-02-31').success).toBe(false)
    expect(() =>
      parseAnalyticsRange({ from: '2026-09-02', to: '2026-09-01' })
    ).toThrow(TRPCError)
  })
})

describe('comparisonTargetSchema', () => {
  test('accepts selected games and game-to-bar targets', () => {
    const first = crypto.randomUUID()
    const second = crypto.randomUUID()

    expect(
      comparisonTargetSchema.safeParse({
        type: 'events',
        eventIds: [first, second]
      }).success
    ).toBe(true)
    expect(
      comparisonTargetSchema.safeParse({
        type: 'event_to_bar',
        eventId: first
      }).success
    ).toBe(true)
  })

  test('requires at least one game and caps the selection', () => {
    expect(
      comparisonTargetSchema.safeParse({ type: 'events', eventIds: [] }).success
    ).toBe(false)
    expect(
      comparisonTargetSchema.safeParse({
        type: 'events',
        eventIds: Array.from({ length: 21 }, () => crypto.randomUUID())
      }).success
    ).toBe(false)
  })
})
