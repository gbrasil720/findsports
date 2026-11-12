import { describe, expect, test } from 'bun:test'

import {
  kendallTau,
  percentile,
  swappedCards,
  syntheticProfiles
} from './recommender-eval'

describe('recommender eval metrics (WEB-426)', () => {
  test('kendall tau: same order 1, reversed -1, one swap in between', () => {
    expect(kendallTau([4, 3, 2, 1], [40, 30, 20, 10])).toBe(1)
    expect(kendallTau([4, 3, 2, 1], [1, 2, 3, 4])).toBe(-1)
    expect(kendallTau([4, 3, 2, 1], [3, 4, 2, 1])).toBeCloseTo(4 / 6)
  })

  test('counts cards of the variant trio missing from the control', () => {
    expect(swappedCards(['a', 'b', 'c'], ['c', 'b', 'a'])).toBe(0)
    expect(swappedCards(['a', 'b', 'c'], ['a', 'x', 'y'])).toBe(2)
  })

  test('percentile', () => {
    expect(percentile([5, 1, 3], 0.5)).toBe(3)
    expect(percentile([], 0.95)).toBe(0)
  })

  test('synthetic profiles are reproducible by seed', () => {
    const first = syntheticProfiles(3, 7)
    expect(JSON.stringify(syntheticProfiles(3, 7))).toBe(JSON.stringify(first))
    expect(JSON.stringify(syntheticProfiles(3, 8))).not.toBe(
      JSON.stringify(first)
    )
  })
})
