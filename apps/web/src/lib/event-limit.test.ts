import { describe, expect, test } from 'bun:test'

import { eventLimitReachedTitle } from './event-limit'

describe('eventLimitReachedTitle', () => {
  test('com ciclo vigente diz até quando o limite vale', () => {
    // Meio-dia UTC: o mesmo dia em qualquer fuso do Brasil.
    expect(eventLimitReachedTitle('2026-11-09T12:00:00.000Z')).toBe(
      'Limite de jogos atingido até 9 de novembro'
    )
  })

  test('sem ciclo vigente fala da janela de 30 dias', () => {
    expect(eventLimitReachedTitle(null)).toBe(
      'Limite de jogos atingido nos últimos 30 dias'
    )
  })
})
