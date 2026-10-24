import { describe, expect, test } from 'bun:test'
import { findAmenity } from '@findsports_oficial/api/lib/amenities'
import {
  activeCount,
  applyShortcut,
  CHIP_GROUPS,
  dayKey,
  defaultShortcuts,
  MAX_SHORTCUTS,
  NO_FILTERS,
  SEARCH_LIMIT,
  searchInput,
  searchRadius,
  shortcutLabel,
  shortcutOn,
  sportCode,
  sportsMineFirst,
  toggleShortcut
} from './filters'

// 20/10/2026, 23:30 em Brasília: já 21/10 em UTC.
const NOW = Date.parse('2026-10-21T02:30:00Z')
const SPORTS = [
  { id: 's1', slug: 'futebol', name: 'Futebol' },
  { id: 's2', slug: 'basquete', name: 'Basquete' }
]

describe('filtros e atalhos (19d, 19e)', () => {
  test('hoje e amanhã são dias de Brasília', () => {
    expect(dayKey(NOW)).toBe('2026-10-20')
    expect(dayKey(NOW, 1)).toBe('2026-10-21')
  })

  test('atalho liga e desliga o filtro dele', () => {
    const today = applyShortcut('hoje', NO_FILTERS, SPORTS, NOW)
    expect(today.date).toBe('2026-10-20')
    expect(shortcutOn('hoje', today, SPORTS, NOW)).toBe(true)
    expect(shortcutOn('amanha', today, SPORTS, NOW)).toBe(false)
    // Amanhã troca o dia em vez de somar.
    expect(applyShortcut('amanha', today, SPORTS, NOW).date).toBe('2026-10-21')
    expect(applyShortcut('hoje', today, SPORTS, NOW).date).toBeNull()

    const football = applyShortcut('esporte:futebol', NO_FILTERS, SPORTS, NOW)
    expect(football.sportId).toBe('s1')
    expect(applyShortcut('item:1', football, SPORTS, NOW).amenities).toEqual([
      1
    ])
    expect(applyShortcut('raio:2', NO_FILTERS, SPORTS, NOW).radius).toBe(2)
    expect(
      activeCount({
        date: 'x',
        sportId: 's1',
        amenities: [1, 4],
        radius: 2,
        gamesOnly: true
      })
    ).toBe(6)
  })

  test('fileira: até cinco, sem repetir', () => {
    const base = defaultShortcuts('futebol')
    expect(base).toEqual(['hoje', 'item:1', 'item:4', 'esporte:futebol'])
    const five = toggleShortcut(base, 'amanha')
    expect(five).toHaveLength(MAX_SHORTCUTS)
    expect(toggleShortcut(five, 'raio:2')).toBe(five)
    expect(toggleShortcut(five, 'hoje')).not.toContain('hoje')
  })

  test('sigla e ordem dos esportes', () => {
    expect(sportCode('Futebol')).toBe('FU')
    expect(sportCode('Fórmula 1')).toBe('F1')
    expect(sportCode('MMA')).toBe('MMA')
    expect(sportCode('Vôlei')).toBe('VÔ')
    expect(sportCode('MMA / UFC')).toBe('MMA')
    expect(sportCode('Futebol Americano')).toBe('FA')
    expect(sportsMineFirst(SPORTS, ['s2']).map((s) => s.id)).toEqual([
      's2',
      's1'
    ])
  })
})

describe('searchInput', () => {
  const center = { lat: -23.56, lng: -46.69 }

  test('sem filtro, só centro, raio e o limite', () => {
    expect(searchInput(NO_FILTERS, center, 3)).toEqual({
      ...center,
      radiusKm: 3,
      date: undefined,
      sportId: undefined,
      amenities: undefined,
      limit: SEARCH_LIMIT
    })
  })

  test('leva dia, esporte e características', () => {
    const input = searchInput(
      { ...NO_FILTERS, date: '2026-10-21', sportId: 's1', amenities: [1, 4] },
      center,
      5
    )
    expect(input).toMatchObject({
      date: '2026-10-21',
      sportId: 's1',
      amenities: [1, 4]
    })
  })

  test('o "Ver N bares" conta no limite do mapa', () => {
    // Antes os filtros pediam 50 e o mapa 30: o botão dizia "Ver 42 bares"
    // e o Explorar mostrava 30.
    expect(SEARCH_LIMIT).toBe(30)
  })
})

describe('searchRadius', () => {
  test('o do filtro ganha do perfil', () => {
    expect(searchRadius({ ...NO_FILTERS, radius: 10 }, 3)).toBe(10)
    expect(searchRadius(NO_FILTERS, 3)).toBe(3)
  })

  test('nunca passa do teto', () => {
    expect(searchRadius(NO_FILTERS, 80)).toBe(50)
  })
})

describe('características em chip (WEB-455)', () => {
  test('Pagamento separa Pix, Cartão e Vale-refeição, com Couvert', () => {
    expect(CHIP_GROUPS[0]?.items.map((i) => i.label)).toEqual([
      'Pix',
      'Cartão',
      'Vale-refeição',
      'Couvert'
    ])
  })

  test('cada chip é o item do catálogo com o mesmo nome', () => {
    for (const item of CHIP_GROUPS.flatMap((g) => g.items)) {
      expect(findAmenity(item.id)?.label).toBe(item.label)
    }
  })

  test('o atalho de um chip tem nome; o antigo "Pix e cartão" (14), não', () => {
    expect(shortcutLabel('item:18', SPORTS)).toEqual({ label: 'Vale-refeição' })
    expect(shortcutLabel('item:14', SPORTS)).toBeNull()
  })
})
