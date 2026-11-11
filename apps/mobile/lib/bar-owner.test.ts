import { describe, expect, it } from 'bun:test'
import {
  arrivalsByHour,
  dayKicker,
  delta,
  gameState,
  profileChecklist,
  shortDate,
  sinceLabel,
  todayGames,
  visitLine,
  weekDays,
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
    expect(delta(0.3)).toBeNull()
  })
})

describe('semana da casa', () => {
  it('sete dias a partir de hoje em Brasília', () => {
    const days = weekDays(NOW)
    expect(days).toHaveLength(7)
    expect(days[0]).toBe('2026-10-12')
    expect(days[6]).toBe('2026-10-18')
  })
})

describe('quem vai', () => {
  it('chegadas por hora de Brasília a partir da hora antes do jogo', () => {
    // Jogo às 21:30 (00:30 UTC); chegadas às 20:10, 21:05 e 21:40.
    const bars = arrivalsByHour(
      ['2026-10-12T23:10:00Z', '2026-10-13T00:05:00Z', '2026-10-13T00:40:00Z'],
      '2026-10-13T00:30:00Z'
    )
    expect(bars[0]).toEqual({ hour: 20, count: 1 })
    expect(bars[1]).toEqual({ hour: 21, count: 2 })
    expect(bars).toHaveLength(4)
  })

  it('chegada cedo fica na primeira coluna; não dá a volta no dia', () => {
    const bars = arrivalsByHour(
      ['2026-10-12T22:00:00Z', '2026-10-13T13:00:00Z'],
      '2026-10-13T00:30:00Z'
    )
    expect(bars[0]?.count).toBe(1)
    expect(bars.length).toBeLessThanOrEqual(13)
  })

  it('há quanto tempo', () => {
    expect(sinceLabel(new Date(NOW - 40 * 60_000), NOW)).toBe('há 40 min')
    expect(sinceLabel(new Date(NOW - 2 * 3_600_000), NOW)).toBe('há 2 h')
  })
})

it('dia curto', () => {
  expect(shortDate('2026-10-17T19:00:00Z')).toBe('SÁB 17')
})

it('perfil: o primeiro que falta vira a frase', () => {
  const list = profileChecklist({
    cover: true,
    description: false,
    hours: true,
    phone: true,
    amenities: true,
    gallery: true,
    offer: true
  })
  expect(list.filter((i) => i.done)).toHaveLength(6)
  expect(list.find((i) => !i.done)?.label).toBe('a descrição')
})
