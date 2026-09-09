import { describe, expect, it } from 'bun:test'
import { formatAnalyticsValue, sumAnalyticsActions } from './admin-model'

describe('admin analytics display helpers', () => {
  it('identifies locked metrics instead of rendering zero', () => {
    expect(formatAnalyticsValue(null)).toBe('Exclusivo do plano superior')
    expect(formatAnalyticsValue(0)).toBe('0')
  })

  it('sums actions only when every channel is visible', () => {
    expect(
      sumAnalyticsActions({
        directionsOpened: 3,
        phoneClicked: 2,
        whatsappOpened: 1
      })
    ).toBe(6)
    expect(
      sumAnalyticsActions({
        directionsOpened: null,
        phoneClicked: null,
        whatsappOpened: null
      })
    ).toBeNull()
  })
})
