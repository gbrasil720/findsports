import { describe, expect, test } from 'bun:test'
import {
  comparisonStartsOn,
  performanceStage,
  sinceLive,
  untilGame
} from './performance-history'

// 14/11/2026, 15:00 em Brasília.
const now = Date.parse('2026-11-14T18:00:00Z')
const game = (startsAt: string, publishedAt: string | null = startsAt) => ({
  startsAt,
  endsAt: null,
  publishedAt
})

describe('performanceStage', () => {
  test('sem jogo publicado, rascunho não conta', () => {
    expect(performanceStage([], now)).toEqual({ kind: 'no-games' })
    expect(performanceStage([game('2026-11-15T19:00:00Z', null)], now)).toEqual(
      { kind: 'no-games' }
    )
  })

  test('antes do primeiro jogo: o mais cedo dos publicados', () => {
    const late = game('2026-11-20T19:00:00Z')
    const early = game('2026-11-15T19:00:00Z')
    expect(performanceStage([late, early], now)).toEqual({
      kind: 'before-first',
      game: early
    })
  })

  test('jogo ao vivo ainda é antes do primeiro; encerrado já jogou', () => {
    const live = game('2026-11-14T17:00:00Z')
    expect(performanceStage([live], now).kind).toBe('before-first')
    expect(
      performanceStage([game('2026-11-10T19:00:00Z'), live], now).kind
    ).toBe('played')
  })
})

describe('comparisonStartsOn', () => {
  test('criado hoje, 30 dias: aparece em 13 jan (criação + 60 dias)', () => {
    expect(comparisonStartsOn('2026-11-14T13:00:00Z', 30, now)).toBe(
      '2027-01-13'
    )
  })

  test('com dois períodos de história, nulo', () => {
    expect(comparisonStartsOn('2026-09-01T13:00:00Z', 30, now)).toBeNull()
    expect(comparisonStartsOn('2026-11-07T13:00:00Z', 3, now)).toBeNull()
  })

  test('o dia da criação é o de Brasília', () => {
    // 01:00 UTC de 15/11 ainda é 14/11 em Brasília.
    expect(comparisonStartsOn('2026-11-15T01:00:00Z', 7, now)).toBe(
      '2026-11-28'
    )
  })
})

test('sinceLive corta os dias antes do bar existir', () => {
  const points = ['2026-11-12', '2026-11-13', '2026-11-14'].map((date) => ({
    date,
    value: 0
  }))
  expect(sinceLive(points, '2026-11-13T15:00:00Z').map((p) => p.date)).toEqual([
    '2026-11-13',
    '2026-11-14'
  ])
})

test('untilGame: horas e minutos, sem segundos, nunca negativo', () => {
  expect(untilGame('2026-11-15T21:05:30Z', now)).toEqual({
    value: '27',
    unit: 'h 05'
  })
  expect(untilGame('2026-11-14T18:45:00Z', now)).toEqual({
    value: '45',
    unit: 'min'
  })
  expect(untilGame('2026-11-14T17:00:00Z', now)).toEqual({
    value: '0',
    unit: 'min'
  })
})
