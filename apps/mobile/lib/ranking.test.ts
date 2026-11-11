import { describe, expect, it } from 'bun:test'
import {
  chaseLabel,
  cityLayout,
  closesLabel,
  fansLabel,
  histogramBars,
  lastLine,
  monthClock,
  monthLabel,
  ordinal,
  topLabel
} from './ranking'

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

describe('lista da cidade', () => {
  const rows = (from: number, to: number) =>
    Array.from({ length: to - from + 1 }, (_, i) => ({ position: from + i }))
  const positions = (list: { position: number }[]) =>
    list.map((row) => row.position)

  it('top, corte com quantos ficam no meio e a vizinhança', () => {
    const layout = cityLayout(rows(1, 8), rows(1282, 1286), 38420)
    expect(positions(layout.top)).toEqual(positions(rows(1, 8)))
    expect(layout.gap).toBe(1273)
    expect(fansLabel(layout.gap)).toBe('1.273 TORCEDORES')
    expect(positions(layout.around)).toEqual([1282, 1283, 1284, 1285, 1286])
    expect(layout.rest).toBe(0)
  })

  it('o topo alcança a vizinhança: uma lista só, sem repetir', () => {
    const layout = cityLayout(rows(1, 38), rows(37, 41), 100)
    expect(positions(layout.top)).toEqual(positions(rows(1, 41)))
    expect(layout.gap).toBe(0)
    expect(layout.around).toEqual([])
    expect(layout.rest).toBe(59)
    // Encostados (8 e 9): também junta.
    expect(cityLayout(rows(1, 8), rows(9, 13), 13).gap).toBe(0)
  })

  it('você no top e cidade pequena', () => {
    expect(cityLayout(rows(1, 3), rows(1, 3), 3)).toEqual({
      top: rows(1, 3),
      gap: 0,
      around: [],
      rest: 0
    })
    expect(fansLabel(1)).toBe('1 TORCEDOR')
  })
})

describe('fatia da cidade', () => {
  it('arredonda para cima e nunca passa de 100% nem fica em 0%', () => {
    expect(topLabel(1284, 38420)).toBe('Top 4%')
    expect(topLabel(1, 38420)).toBe('Top 1%')
    expect(topLabel(5, 5)).toBe('Top 100%')
    expect(topLabel(1, 0)).toBe('Top 100%')
  })
})

describe('rodada 6', () => {
  it('o relógio vai até a meia-noite de Brasília do dia 1º', () => {
    // 08/11/2026, 20:00 em Brasília: faltam 22 dias e 4 horas.
    expect(monthClock('2026-11', Date.parse('2026-11-08T23:00:00Z'))).toEqual({
      days: 22,
      hours: 4
    })
  })
  it('a última ida e a estreia', () => {
    const now = Date.parse('2026-11-10T23:00:00Z')
    const day = (d: number) => new Date(now - d * 86_400_000).toISOString()
    expect(lastLine(day(1), day(40), now)).toBe('foi ontem')
    expect(lastLine(day(0), day(40), now)).toBe('foi hoje')
    expect(lastLine(day(4), day(40), now)).toBe('foi há 4 dias')
    expect(lastLine(day(2), day(3), now)).toBe('estreou')
    expect(lastLine(null, null, now)).toBeNull()
  })
  it('o histograma marca a sua barra e agrupa acima de 24', () => {
    const bars = histogramBars(
      [
        { value: 0, count: 50 },
        { value: 1, count: 10 },
        { value: 3, count: 20 }
      ],
      3
    )
    expect(bars.map((b) => b.count)).toEqual([10, 0, 20])
    expect(bars[2]?.me).toBe(true)
    expect(bars[2]?.share).toBe(1)
    expect(histogramBars([{ value: 48, count: 1 }], 1)).toHaveLength(24)
  })
})
