import { describe, expect, it } from 'bun:test'
import { smooth } from './curva'

/** Todos os y do caminho: pontos de controle e pontas. */
const ys = (d: string) =>
  [...d.matchAll(/(-?\d+\.\d) (-?\d+\.\d)/g)].map((m) => Number(m[2]))

describe('smooth', () => {
  // SVG: y cresce para baixo. Base em 100, dias de 2, 2, 0, 0, 1, 0.
  const base = 100
  const pts: [number, number][] = [2, 2, 0, 0, 1, 0].map((v, i) => [
    i * 10,
    base - v * 20
  ])
  const d = smooth(pts)

  it('passa por todos os pontos', () => {
    for (const [x, y] of pts)
      expect(d).toContain(`${x.toFixed(1)} ${y.toFixed(1)}`)
  })

  it('não passa do pico nem afunda abaixo da base', () => {
    // Os controles ficam dentro da faixa dos dados: a curva também.
    for (const y of ys(d)) {
      expect(y).toBeGreaterThanOrEqual(base - 40)
      expect(y).toBeLessThanOrEqual(base)
    }
  })

  it('aguenta um ponto só e nenhum', () => {
    expect(smooth([[5, 5]])).toBe('M5.0 5.0')
    expect(smooth([])).toBe('')
  })
})
