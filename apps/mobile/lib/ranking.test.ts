import { describe, expect, it } from 'bun:test'
import { chaseLabel, closesLabel, monthLabel, ordinal } from './ranking'

describe('frases do ranking', () => {
  it('mês, fechamento e a distância para quem está acima', () => {
    expect(monthLabel('2026-10')).toBe('Outubro')
    expect(closesLabel(18)).toBe('Fecha em 18 dias')
    expect(closesLabel(1)).toBe('Fecha amanhã')
    expect(closesLabel(0)).toBe('Fecha hoje')
    expect(chaseLabel('bars', 3, 'Marina Costa')).toBe(
      'Faltam 3 bares para passar Marina'
    )
    expect(chaseLabel('neighborhoods', 1, 'Rafael')).toBe(
      'Falta 1 bairro para passar Rafael'
    )
    expect(ordinal(1284)).toBe('1.284º')
  })
})
