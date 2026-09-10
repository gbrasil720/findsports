import { describe, expect, test } from 'bun:test'

import {
  DEFAULT_RADIUS_KM,
  isValidCoordinate,
  isValidCoordinates,
  normalizeRadiusKm
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
})

describe('normalizeRadiusKm', () => {
  test('devolve o degrau exato quando ele já é válido', () => {
    expect(normalizeRadiusKm(1)).toBe(1)
    expect(normalizeRadiusKm(3)).toBe(3)
    expect(normalizeRadiusKm(10)).toBe(10)
  })

  test('cai no degrau mais próximo em vez de não marcar nada', () => {
    // `search_radius_km` é um `integer` no banco: nada impede um 7 salvo por
    // uma versão antiga ou por importação.
    expect(normalizeRadiusKm(7)).toBe(5)
    expect(normalizeRadiusKm(2)).toBe(1)
    expect(normalizeRadiusKm(40)).toBe(10)
  })

  test('sem raio salvo, usa o padrão do produto', () => {
    expect(normalizeRadiusKm(undefined)).toBe(DEFAULT_RADIUS_KM)
    expect(normalizeRadiusKm(null)).toBe(DEFAULT_RADIUS_KM)
    expect(normalizeRadiusKm(Number.NaN)).toBe(DEFAULT_RADIUS_KM)
  })
})
