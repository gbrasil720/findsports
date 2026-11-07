import { describe, expect, test } from 'bun:test'

import { nextRoundAt, roundDay } from './round'

describe('rodada diária (vira às 10:00 de Brasília)', () => {
  test('antes das 10:00 ainda vale a rodada de ontem', () => {
    expect(roundDay(new Date('2026-10-22T12:59:59Z'))).toBe('2026-10-21')
    expect(roundDay(new Date('2026-10-22T13:00:00Z'))).toBe('2026-10-22')
  })

  test('a noite de Brasília continua no mesmo dia da rodada', () => {
    // 21/10 às 23:00 em Brasília já é 22/10 em UTC.
    expect(roundDay(new Date('2026-10-22T02:00:00Z'))).toBe('2026-10-21')
  })

  test('a próxima rodada abre às 10:00 de Brasília', () => {
    expect(nextRoundAt(new Date('2026-10-22T12:59:00Z')).toISOString()).toBe(
      '2026-10-22T13:00:00.000Z'
    )
    expect(nextRoundAt(new Date('2026-10-22T13:00:00Z')).toISOString()).toBe(
      '2026-10-23T13:00:00.000Z'
    )
    expect(nextRoundAt(new Date('2026-10-31T20:00:00Z')).toISOString()).toBe(
      '2026-11-01T13:00:00.000Z'
    )
  })
})
