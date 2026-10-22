import { describe, expect, it } from 'bun:test'

import {
  brasiliaDays,
  conversionDiff,
  monthProjection,
  periodStart
} from './report'

describe('tela IA do Houdini', () => {
  // 21/10 às 15h de Brasília.
  const now = new Date('2026-10-21T18:00:00Z')

  it('períodos começam à meia-noite de Brasília', () => {
    expect(periodStart('today', now)?.toISOString()).toBe(
      '2026-10-21T03:00:00.000Z'
    )
    expect(periodStart('7d', now)?.toISOString()).toBe(
      '2026-10-15T03:00:00.000Z'
    )
    expect(periodStart('30d', now)?.toISOString()).toBe(
      '2026-09-22T03:00:00.000Z'
    )
    expect(periodStart('month', now)?.toISOString()).toBe(
      '2026-10-01T03:00:00.000Z'
    )
    expect(periodStart('all', now)).toBeNull()
  })

  it('projeção do mês no ritmo atual', () => {
    // 20 dias e 15 h de um mês de 31 dias.
    const elapsed = 20 + 15 / 24
    expect(monthProjection(10, now)).toBeCloseTo((10 * 31) / elapsed, 6)
    expect(monthProjection(10, new Date('2026-10-01T03:00:00Z'))).toBe(0)
  })

  it('dias do gráfico, de ponta a ponta', () => {
    expect(brasiliaDays(new Date('2026-10-19T12:00:00Z'), now)).toEqual([
      '2026-10-19',
      '2026-10-20',
      '2026-10-21'
    ])
  })

  it('amostra pequena não compara', () => {
    expect(
      conversionDiff(
        { conversations: 99, conversions: 30 },
        { conversations: 200, conversions: 50 }
      )
    ).toEqual({ enough: false, missing: 'A tem 99 de 100 conversas' })
    expect(
      conversionDiff(
        { conversations: 100, conversions: 30 },
        { conversations: 120, conversions: 3 }
      )
    ).toMatchObject({ enough: false })
  })

  it('diferença B − A com intervalo de 95%', () => {
    // A: 30/150 = 20%; B: 60/150 = 40%. EP = √(0,2·0,8/150 + 0,4·0,6/150).
    const se = Math.sqrt((0.2 * 0.8) / 150 + (0.4 * 0.6) / 150)
    const result = conversionDiff(
      { conversations: 150, conversions: 30 },
      { conversations: 150, conversions: 60 }
    )
    if (!result.enough) throw new Error(result.missing)
    expect(result.diff).toBeCloseTo(0.2, 10)
    expect(result.low).toBeCloseTo(0.2 - 1.96 * se, 10)
    expect(result.high).toBeCloseTo(0.2 + 1.96 * se, 10)
    expect(result.significant).toBe(true)

    const tie = conversionDiff(
      { conversations: 100, conversions: 20 },
      { conversations: 100, conversions: 22 }
    )
    expect(tie).toMatchObject({ enough: true, significant: false })
  })
})
