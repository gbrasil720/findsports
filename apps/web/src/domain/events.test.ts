import { describe, expect, test } from 'bun:test'

import { getEventTemporalState, LIVE_WINDOW_MS } from './events'

const START = new Date('2026-08-13T12:00:00.000Z')

describe('getEventTemporalState', () => {
  test('is upcoming before the event starts', () => {
    expect(getEventTemporalState(START, null, START.getTime() - 1)).toBe(
      'upcoming'
    )
  })

  test('is live from the start through the existing three-hour boundary', () => {
    expect(getEventTemporalState(START, null, START)).toBe('live')
    expect(
      getEventTemporalState(START, null, START.getTime() + LIVE_WINDOW_MS)
    ).toBe('live')
  })

  test('is past after the three-hour boundary', () => {
    expect(
      getEventTemporalState(START, null, START.getTime() + LIVE_WINDOW_MS + 1)
    ).toBe('past')
  })

  test('uses the informed end instead of the default live window', () => {
    const shortEnd = new Date(START.getTime() + 60 * 60 * 1000)
    const longEnd = new Date(START.getTime() + 5 * 60 * 60 * 1000)

    expect(getEventTemporalState(START, shortEnd, shortEnd.getTime())).toBe(
      'live'
    )
    expect(getEventTemporalState(START, shortEnd, shortEnd.getTime() + 1)).toBe(
      'past'
    )
    expect(
      getEventTemporalState(
        START,
        longEnd,
        START.getTime() + LIVE_WINDOW_MS + 1
      )
    ).toBe('live')
  })
})
