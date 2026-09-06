import { describe, expect, test } from 'bun:test'

import { getCommercialDay } from './commercial-day'

describe('getCommercialDay', () => {
  test('changes day at midnight in São Paulo, not at midnight UTC', () => {
    expect(getCommercialDay(new Date('2026-09-07T02:59:59.999Z'))).toBe(
      '2026-09-06'
    )
    expect(getCommercialDay(new Date('2026-09-07T03:00:00.000Z'))).toBe(
      '2026-09-07'
    )
  })
})
