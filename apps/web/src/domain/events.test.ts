import { describe, expect, test } from 'bun:test'

import { getEventTemporalState, LIVE_WINDOW_MS } from './events'

const START = new Date('2026-08-13T12:00:00.000Z')

describe('getEventTemporalState', () => {
  test('is upcoming before the event starts', () => {
    expect(getEventTemporalState(START, START.getTime() - 1)).toBe('upcoming')
  })

  test('is live from the start through the existing three-hour boundary', () => {
    expect(getEventTemporalState(START, START)).toBe('live')
    expect(getEventTemporalState(START, START.getTime() + LIVE_WINDOW_MS)).toBe(
      'live'
    )
  })

  test('is past after the three-hour boundary', () => {
    expect(
      getEventTemporalState(START, START.getTime() + LIVE_WINDOW_MS + 1)
    ).toBe('past')
  })
})
