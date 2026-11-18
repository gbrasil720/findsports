import { describe, expect, it } from 'bun:test'
import { curveY, fitTop, smooth } from './curva'

/** O y da curva em 501 pontos de x, de 0 ao último ponto. */
const sample = (pts: [number, number][], floor: number) => {
  const end = pts.at(-1)?.[0] ?? 0
  return Array.from({ length: 501 }, (_, i) =>
    curveY(pts, floor, (i / 500) * end)
  )
}

describe('curva do painel', () => {
  // SVG: y cresce para baixo. Base em 100, dias de 2, 2, 0, 0, 1, 0.
  const base = 100
  const pts: [number, number][] = [2, 2, 0, 0, 1, 0].map((v, i) => [
    i * 10,
    base - v * 20
  ])
  const samples = sample(pts, base)

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
    const at = (samples.indexOf(topY) / 500) * 50
    expect(at).toBeGreaterThan(0)
    expect(at).toBeLessThan(10)
    expect(curveY(pts, base, at)).toBe(topY)
  })

  it('dois dias iguais no topo: a escala desce e o pico cabe redondo', () => {
    // Gráfico da Atividade diária: 900 × 260, topo dos dados em 16, base em
    // 236. Sem folga, o arredondado entre os dois dias de 100 subia a y ≈ -14,
    // fora do SVG.
    const floor = 236
    const at = (t: number): [number, number][] =>
      [0, 100, 100, 0].map((v, i) => [i * 300, floor - (v / 100) * (floor - t)])
    expect(Math.min(...sample(at(16), floor))).toBeLessThan(0)
    const t = fitTop([at(16)], floor, 16, 4)
    expect(t).toBeGreaterThan(16)
    const fitted = sample(at(t), floor)
    expect(Math.min(...fitted)).toBeCloseTo(4, 0)
    // O pico é um ponto só, no meio: sem trecho reto.
    expect(fitted.filter((y) => y < 4.05).length).toBeLessThan(10)
    // Quem já cabe não muda.
    expect(fitTop([pts], base, 60, 0)).toBe(60)
  })

  it('aguenta um ponto só e nenhum', () => {
    expect(smooth([[5, 5]], base)).toBe('M5.0 5.0')
    expect(smooth([], base)).toBe('')
    expect(curveY([[5, 5]], base, 5)).toBe(5)
  })
})
