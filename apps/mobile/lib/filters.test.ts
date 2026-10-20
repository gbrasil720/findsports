import { describe, expect, test } from 'bun:test'
import {
  activeCount,
  applyShortcut,
  dayKey,
  defaultShortcuts,
  MAX_SHORTCUTS,
  moveShortcut,
  NO_FILTERS,
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
      activeCount({ date: 'x', sportId: 's1', amenities: [1, 4], radius: 2 })
    ).toBe(5)
  })

  test('fileira: até cinco, sem repetir, e reordena', () => {
    const base = defaultShortcuts('futebol')
    expect(base).toEqual(['hoje', 'item:1', 'item:4', 'esporte:futebol'])
    const five = toggleShortcut(base, 'amanha')
    expect(five).toHaveLength(MAX_SHORTCUTS)
    expect(toggleShortcut(five, 'raio:2')).toBe(five)
    expect(toggleShortcut(five, 'hoje')).not.toContain('hoje')
    expect(moveShortcut(base, 3, 0)).toEqual([
      'esporte:futebol',
      'hoje',
      'item:1',
      'item:4'
    ])
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
