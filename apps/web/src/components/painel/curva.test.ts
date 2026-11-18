import { describe, expect, it } from 'bun:test'
import { curveY, smooth } from './curva'

describe('curva do painel', () => {
  // SVG: y cresce para baixo. Base em 100, dias de 2, 2, 0, 0, 1, 0.
  const base = 100
  const pts: [number, number][] = [2, 2, 0, 0, 1, 0].map((v, i) => [
    i * 10,
    base - v * 20
  ])
  const samples = Array.from({ length: 501 }, (_, i) =>
    curveY(pts, base, i / 10)
  )

  it('passa por todos os pontos', () => {
    const d = smooth(pts, base)
    for (const [x, y] of pts)
      expect(d).toContain(`${x.toFixed(1)} ${y.toFixed(1)}`)
    for (const [x, y] of pts) expect(curveY(pts, base, x)).toBeCloseTo(y, 3)
  })

  it('não afunda abaixo da base', () => {
    for (const y of samples) expect(y).toBeLessThanOrEqual(base + 1e-9)
  })

  it('o cursor encosta no topo da curva, mesmo entre dois dias', () => {
    // O topo fica entre os dois dias de 2: o cursor anda por cima da curva.
    const topY = Math.min(...samples)
    const at = samples.indexOf(topY) / 10
    expect(at).toBeGreaterThan(0)
    expect(at).toBeLessThan(10)
    expect(curveY(pts, base, at)).toBe(topY)
  })

  it('aguenta um ponto só e nenhum', () => {
    expect(smooth([[5, 5]], base)).toBe('M5.0 5.0')
    expect(smooth([], base)).toBe('')
    expect(curveY([[5, 5]], base, 5)).toBe(5)
  })
})
