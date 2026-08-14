import { describe, expect, test } from 'bun:test'

import {
  getRadiusZoom,
  isValidCoordinate,
  isValidCoordinates
} from './discovery'

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

  test.each([
    [1, 15],
    [3, 14],
    [5, 13],
    [10, 12]
  ] as const)('maps %i km to zoom %i', (radiusKm, zoom) => {
    expect(getRadiusZoom(radiusKm)).toBe(zoom)
  })
})
