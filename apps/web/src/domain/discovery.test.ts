import { describe, expect, test } from 'bun:test'

import { isValidCoordinate, isValidCoordinates } from './discovery'

describe('discovery coordinates', () => {
  test('accepts valid geographic boundaries', () => {
    expect(isValidCoordinates({ lat: -90, lng: 180 })).toBe(true)
    expect(isValidCoordinates({ lat: 90, lng: -180 })).toBe(true)
  })

  test('rejects non-finite and out-of-range values', () => {
    expect(isValidCoordinate(Number.NaN, 'lat')).toBe(false)
    expect(isValidCoordinates({ lat: 91, lng: 0 })).toBe(false)
    expect(isValidCoordinates({ lat: 0, lng: 181 })).toBe(false)
  })
})
