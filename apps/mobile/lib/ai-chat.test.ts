import { describe, expect, it } from 'bun:test'

import {
  boldSegments,
  chatHistory,
  cheapestFirst,
  resumeLabel
} from './ai-chat'

describe('busca com IA (2h)', () => {
  it('negrito da resposta', () => {
    expect(boldSegments('Achei **Corinthians × Palmeiras** hoje.')).toEqual([
      { text: 'Achei ', bold: false },
      { text: 'Corinthians × Palmeiras', bold: true },
      { text: ' hoje.', bold: false }
    ])
    // Asterisco solto não vira marca nem sobra na tela.
    expect(boldSegments('Sem **fim')).toEqual([
      { text: 'Sem fim', bold: false }
    ])
  })

  it('mais barato: sem gasto médio vai para o fim, empate mantém a ordem', () => {
    const bars = [
      { id: 'a', averageSpendCents: null },
      { id: 'b', averageSpendCents: 9000 },
      { id: 'c', averageSpendCents: 4000 },
      { id: 'd', averageSpendCents: 4000 },
      { id: 'e', averageSpendCents: null }
    ]
    expect(cheapestFirst(bars).map((b) => b.id)).toEqual([
      'c',
      'd',
      'b',
      'a',
      'e'
    ])
  })

  it('quando volta: amanhã, ou o dia 1º do mês seguinte', () => {
    const now = new Date('2026-10-21T18:00:00Z').getTime()
    expect(resumeLabel('2026-10-22T03:00:00.000Z', now)).toBe('amanhã à 0h')
    expect(resumeLabel('2026-11-01T03:00:00.000Z', now)).toBe(
      'em 1º de novembro'
    )
  })

  it('histórico: só trocas respondidas, as últimas', () => {
    const turns = [
      { question: 'um', answer: 'r1' },
      { question: 'dois', answer: null },
      { question: 'três', answer: 'r3' }
    ]
    expect(chatHistory(turns)).toEqual([
      { role: 'user', content: 'um' },
      { role: 'assistant', content: 'r1' },
      { role: 'user', content: 'três' },
      { role: 'assistant', content: 'r3' }
    ])
    expect(chatHistory(turns, 2)).toHaveLength(2)
  })
})
