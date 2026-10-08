import { describe, expect, test } from 'bun:test'

import {
  type DashboardFilters,
  DEFAULT_RADIUS_KM,
  isValidCoordinate,
  isValidCoordinates,
  normalizeRadiusKm,
  parseDashboardFilters,
  serializeDashboardFilters
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

describe('filtros do dashboard no hash (WEB-293)', () => {
  const TIME_A = '0198c5a2-7b1e-7c3a-9f4d-2a6b8c0d1e2f'
  const TIME_B = '0198c5a2-7b1e-7c3a-9f4d-2a6b8c0d1e30'
  const PADRAO: DashboardFilters = {
    championship: '',
    sportSlug: undefined,
    radiusKm: 3,
    amenities: [],
    teamIds: [],
    sort: 'relevance',
    favoritesOnly: false,
    gamesTodayOnly: false
  }

  test('sem filtro o hash é vazio, e hash vazio é o padrão', () => {
    expect(serializeDashboardFilters(PADRAO, 3)).toBe('')
    expect(parseDashboardFilters('', 3)).toEqual(PADRAO)
    expect(parseDashboardFilters('#', 3)).toEqual(PADRAO)
  })

  test('o raio do perfil não vai para o hash; outro raio vai', () => {
    const filtros = { ...PADRAO, sportSlug: 'futebol', radiusKm: 5 as const }
    expect(serializeDashboardFilters(filtros, 3)).toBe('esporte=futebol&raio=5')
    expect(serializeDashboardFilters(filtros, 5)).toBe('esporte=futebol')
    // Sem `raio` no hash, vale o do perfil de quem abre o link.
    expect(parseDashboardFilters('#esporte=futebol', 10).radiusKm).toBe(10)
  })

  test('ida e volta preserva todos os filtros', () => {
    const filtros: DashboardFilters = {
      championship: 'Copa & Cia = 100% #1',
      sportSlug: 'futebol',
      radiusKm: 10,
      amenities: [1, 2],
      teamIds: [TIME_A, TIME_B],
      sort: 'rating',
      favoritesOnly: true,
      gamesTodayOnly: true
    }
    const hash = serializeDashboardFilters(filtros, 3)
    expect(parseDashboardFilters(`#${hash}`, 3)).toEqual(filtros)
    expect(parseDashboardFilters(hash, 3)).toEqual(filtros)
  })

  test('campo inválido cai no padrão sem derrubar os outros', () => {
    expect(
      parseDashboardFilters(
        `#raio=7&comodidade=1&comodidade=9999&comodidade=abc&comodidade=1&time=nao-e-uuid&time=${TIME_A}&ordem=qualquer&favoritos=sim&hoje=1&busca=Flamengo&desconhecido=x`,
        3
      )
    ).toEqual({
      ...PADRAO,
      championship: 'Flamengo',
      amenities: [1],
      teamIds: [TIME_A],
      gamesTodayOnly: true
    })
  })

  test('âncora da página não vira filtro', () => {
    expect(parseDashboardFilters('#main-content', 3)).toEqual(PADRAO)
  })
})
