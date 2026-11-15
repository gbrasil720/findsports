import { describe, expect, it } from 'bun:test'

import {
  brasiliaDays,
  conversionDiff,
  monthProjection,
  periodStart,
  recommenderStops
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

describe('parada do teste do recomendador', () => {
  const arm = (
    rounds: number,
    fellBack: number,
    shown: number,
    passed: number
  ) => ({
    rounds,
    fellBack,
    shown,
    passed
  })

  it('sem dado, nada decidido além do teto', () => {
    const stops = recommenderStops(arm(0, 0, 0, 0), arm(0, 0, 0, 0), false)
    expect(stops.map((s) => s.tripped)).toEqual([null, null, false])
  })

  it('queda para o controle acima de 2% para o C', () => {
    const [fallback] = recommenderStops(
      arm(100, 0, 500, 50),
      arm(100, 3, 500, 50),
      false
    )
    expect(fallback?.tripped).toBe(true)
    expect(fallback?.value).toBeCloseTo(0.03)
    expect(
      recommenderStops(arm(100, 0, 500, 50), arm(100, 2, 500, 50), false)[0]
        ?.tripped
    ).toBe(false)
  })

  it('Passo 30% acima do A para o C', () => {
    const pass = (passedC: number) =>
      recommenderStops(
        arm(100, 0, 500, 50),
        arm(100, 0, 500, passedC),
        false
      )[1]
    expect(pass(66)?.tripped).toBe(true)
    expect(pass(65)?.tripped).toBe(false)
    expect(pass(65)?.value).toBeCloseTo(1.3)
  })

  it('teto do mês estourado para o teste', () => {
    expect(
      recommenderStops(arm(1, 0, 5, 0), arm(1, 0, 5, 0), true)[2]?.tripped
    ).toBe(true)
  })
})
