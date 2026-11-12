import { describe, expect, test } from 'bun:test'
import {
  BudgetStop,
  brasiliaStart,
  brasiliaWeekOf,
  createBudget,
  type FoundGame,
  gameKey,
  hourInPage,
  mergeGames,
  normalizeChannels,
  splitSides,
  withoutClubAffixes
} from './merge'

const found = (
  name: string,
  channels: string[],
  url: string | null,
  extra: Partial<FoundGame> = {}
): FoundGame => ({
  sportId: 'futebol',
  championship: 'Brasileirão Série A',
  name,
  day: '2026-11-18',
  startsAt: new Date('2026-11-18T23:30:00Z'),
  channels,
  source: { kind: url ? 'search' : 'football-data', url, channels: [] },
  ...extra
})

describe('jogos da semana: contas puras', () => {
  test('semana de Brasília: segunda a domingo, mesmo perto da meia-noite UTC', () => {
    // Domingo 23:30 em Brasília é segunda 02:30 UTC.
    const week = brasiliaWeekOf(new Date('2026-11-16T02:30:00Z'))
    expect(week.monday).toBe('2026-11-09')
    expect(week.days).toHaveLength(7)
    expect(week.days.at(-1)).toBe('2026-11-15')
    expect(week.weekday).toBe(0)
    expect(brasiliaWeekOf(new Date('2026-11-19T12:00:00Z')).weekday).toBe(4)
  })

  test('hora de Brasília vira UTC; hora inválida é nula', () => {
    expect(brasiliaStart('2026-11-18', '20:30')?.toISOString()).toBe(
      '2026-11-18T23:30:00.000Z'
    )
    expect(brasiliaStart('2026-11-18', '25:00')).toBeNull()
    expect(brasiliaStart('2026-11-18', 'à noite')).toBeNull()
  })

  test('chave: mando invertido, acento e sufixo não mudam o jogo', () => {
    expect(gameKey('2026-11-18', 'Flamengo x Athletico-PR')).toBe(
      gameKey('2026-11-18', 'Athletico Paranaense × CR Flamengo')
    )
    expect(gameKey('2026-11-18', 'São Paulo vs Fluminense')).toBe(
      gameKey('2026-11-18', 'Sao Paulo FC x Fluminense')
    )
    expect(gameKey('2026-11-18', 'A x B')).not.toBe(
      gameKey('2026-11-19', 'A x B')
    )
    expect(splitSides('GP de Las Vegas')).toBeNull()
  })

  test('canais: nome único, junta e tira o que não é canal', () => {
    expect(
      normalizeChannels([
        'Amazon',
        'ESPN/Disney+',
        'ESPN4',
        'sportv 2',
        'TV aberta',
        'GE TV',
        'Prime Video',
        'Caze TV',
        'Canal Novo'
      ])
    ).toEqual([
      'Prime Video',
      'ESPN',
      'Disney+',
      'SporTV',
      'GE TV',
      'CazéTV',
      'Canal Novo'
    ])
  })

  test('junção: hora do primeiro, canais somados, fontes guardadas', () => {
    const [game, ...rest] = mergeGames([
      found('Vasco x Palmeiras', [], null),
      found('Vasco da Gama x Palmeiras', ['Globo', 'SporTV'], 'https://a', {
        startsAt: new Date('2026-11-18T22:30:00Z')
      }),
      found('Vasco x Palmeiras', ['GE TV', 'Globo'], 'https://b')
    ])
    expect(rest).toHaveLength(0)
    expect(game?.startsAt.toISOString()).toBe('2026-11-18T23:30:00.000Z')
    expect(game?.channels).toEqual(['Globo', 'SporTV', 'GE TV'])
    expect(game?.sources.map((s) => s.url)).toEqual([
      null,
      'https://a',
      'https://b'
    ])
    expect(game?.channelConfirmed).toBe(true)
  })

  test('mesmo início e um lado igual é o mesmo jogo, mesmo com o outro escrito diferente', () => {
    const games = mergeGames([
      found('Mirassol x CA Mineiro', [], null),
      found('Mirassol x Atlético-MG', ['Prime Video'], 'https://a')
    ])
    expect(games).toHaveLength(1)
    expect(games[0]?.channels).toEqual(['Prime Video'])
  })

  test('sigla de clube na ponta sai para casar com o catálogo', () => {
    expect(withoutClubAffixes('CR Vasco da Gama')).toBe('vasco da gama')
    expect(withoutClubAffixes('Chapecoense AF')).toBe('chapecoense')
    expect(withoutClubAffixes('Atlético-MG')).toBe('atletico-mg')
  })

  test('lista da competição inteira não confirma o canal', () => {
    const all = ['Premiere', 'Disney+', 'GE TV']
    const games = mergeGames([
      found('Goiás x Ponte Preta', all, 'https://agregador'),
      found('Avaí x Londrina', all, 'https://agregador'),
      found('Ceará x Remo', all, 'https://agregador'),
      found('Náutico x Paysandu', ['Premiere'], 'https://oficial')
    ])
    expect(games.map((g) => g.channelConfirmed)).toEqual([
      false,
      false,
      false,
      true
    ])
    // Jogo sem canal nunca é confirmado.
    expect(
      mergeGames([found('C x D', [], 'https://x')])[0]?.channelConfirmed
    ).toBe(false)
  })

  test('hora tem de estar escrita na página', () => {
    expect(hourInPage('Flamengo x Bahia, 20h30, no Maracanã', '20:30')).toBe(
      true
    )
    expect(hourInPage('às 9h, horário de Brasília', '09:00')).toBe(true)
    expect(hourInPage('às 21:00', '21:00')).toBe(true)
    expect(hourInPage('às 18h30', '20:30')).toBe(false)
  })

  test('teto: o pior caso precisa caber; o gasto real soma', () => {
    const budget = createBudget(1, 0.9)
    budget.guard(0.05)
    budget.add(0.04)
    expect(budget.runUsd).toBeCloseTo(0.04)
    expect(budget.monthUsd).toBeCloseTo(0.94)
    expect(() => budget.guard(0.07)).toThrow(BudgetStop)
  })
})
