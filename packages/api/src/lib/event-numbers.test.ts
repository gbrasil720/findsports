import { describe, expect, it } from 'bun:test'
import { withAverage } from './event-numbers'

const row = (eventId: string, interested: number) => ({
  eventId,
  interested,
  interestedLastDay: 0,
  views: 0,
  barsInNeighborhood: 0
})

describe('withAverage', () => {
  it('compara o jogo encerrado com a média dos encerrados', () => {
    const rows = [10, 10, 10, 10, 20].map((n, i) => row(`p${i}`, n))
    const ended = new Set(rows.map((r) => r.eventId))
    const out = withAverage([...rows, row('next', 50)], ended)
    // Média 12: o de 20 fica 67% acima; o próximo não ganha comparação.
    expect(out.find((r) => r.eventId === 'p4')?.vsAverage).toBe(67)
    expect(out.find((r) => r.eventId === 'next')?.vsAverage).toBeNull()
  })

  it('sem cinco jogos encerrados, nada de média', () => {
    const rows = [10, 20].map((n, i) => row(`p${i}`, n))
    const out = withAverage(rows, new Set(['p0', 'p1']))
    expect(out.every((r) => r.vsAverage === null)).toBe(true)
  })
})
