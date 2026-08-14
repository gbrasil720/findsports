import { describe, expect, test } from 'bun:test'

import {
  buildEventCreationPolicy,
  type EventPolicyBar,
  getEventCreationPeriod,
  subtractUtcMonthClamped
} from './event-creation-policy'

const NOW = new Date('2026-08-13T15:30:00.000Z')

function makeBar(
  plan: 'starter' | 'pro' | 'elite',
  overrides: Partial<EventPolicyBar> = {}
): EventPolicyBar {
  return {
    id: 'bar-1',
    isActive: true,
    subscription: {
      plan,
      currentPeriodEnd: new Date('2026-08-31T12:00:00.000Z')
    },
    ...overrides
  }
}

describe('event creation period', () => {
  test.each([
    ['2026-03-31T10:15:00.000Z', '2026-02-28T10:15:00.000Z'],
    ['2024-03-31T10:15:00.000Z', '2024-02-29T10:15:00.000Z'],
    ['2026-05-31T10:15:00.000Z', '2026-04-30T10:15:00.000Z'],
    ['2026-01-15T10:15:00.000Z', '2025-12-15T10:15:00.000Z']
  ])('clamps %s to %s', (input, expected) => {
    expect(subtractUtcMonthClamped(new Date(input)).toISOString()).toBe(
      expected
    )
  })

  test('uses the existing 30-day fallback when billing has no period end', () => {
    const period = getEventCreationPeriod(null, NOW)
    expect(period.end).toBeNull()
    expect(period.start.toISOString()).toBe('2026-07-14T15:30:00.000Z')
  })
})

describe('event creation policy', () => {
  test.each([
    [0, true, 5],
    [4, true, 1],
    [5, false, 0]
  ])('Starter with %i used events', (used, canCreate, remaining) => {
    expect(
      buildEventCreationPolicy({ bar: makeBar('starter'), used, now: NOW })
    ).toMatchObject({
      status: 'limited',
      plan: 'starter',
      used,
      canCreate,
      remaining
    })
  })

  test.each(['pro', 'elite'] as const)('%s remains unlimited', (plan) => {
    expect(
      buildEventCreationPolicy({ bar: makeBar(plan), used: 999, now: NOW })
    ).toEqual({ status: 'unlimited', canCreate: true, plan })
  })

  test('an inactive bar cannot create regardless of plan', () => {
    expect(
      buildEventCreationPolicy({
        bar: makeBar('elite', { isActive: false }),
        used: 0,
        now: NOW
      })
    ).toEqual({ status: 'inactive', canCreate: false, plan: 'elite' })
  })
})
