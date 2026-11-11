import { describe, expect, it } from 'bun:test'
import {
  dayKicker,
  delta,
  gameState,
  todayGames,
  visitLine,
  weekdayName
} from './bar-owner'

// Segunda, 12/10/2026, 21:12 em Brasília (00:12 UTC do dia 13).
const NOW = Date.parse('2026-10-13T00:12:00Z')
const at = (iso: string) => ({ startsAt: iso, endsAt: null, publishedAt: iso })

describe('app do dono', () => {
  it('estado do jogo', () => {
    expect(gameState(at('2026-10-13T00:30:00Z'), NOW)).toBe('upcoming')
    expect(gameState(at('2026-10-12T23:30:00Z'), NOW)).toBe('live')
    expect(gameState(at('2026-10-12T15:00:00Z'), NOW)).toBe('ended')
    expect(
      gameState({ ...at('2026-10-13T00:30:00Z'), publishedAt: null }, NOW)
    ).toBe('draft')
  })

  it('jogos de hoje pelo dia de Brasília, sem rascunho, em ordem', () => {
    const games = [
      at('2026-10-13T01:00:00Z'), // 22:00 de hoje
      at('2026-10-12T23:30:00Z'), // 20:30 de hoje, ao vivo
      at('2026-10-13T15:00:00Z'), // amanhã
      { ...at('2026-10-13T00:30:00Z'), publishedAt: null }
    ]
    expect(todayGames(games, NOW).map((g) => g.startsAt)).toEqual([
      '2026-10-12T23:30:00Z',
      '2026-10-13T01:00:00Z'
    ])
  })

  it('frases curtas', () => {
    expect(visitLine({ firstVisit: true, visitsThisMonth: 1 })).toBe(
      'primeira vez no bar'
    )
    expect(visitLine({ firstVisit: false, visitsThisMonth: 4 })).toBe(
      '4ª vez no mês'
    )
    expect(dayKicker(NOW)).toBe('SEG 12 OUT')
    expect(weekdayName(NOW)).toBe('de segunda')
    expect(delta(18.4)).toBe('+18%')
    expect(delta(-4)).toBe('−4%')
    expect(delta(null)).toBeNull()
  })
})
