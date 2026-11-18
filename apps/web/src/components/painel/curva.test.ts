import { describe, expect, it } from 'bun:test'
import { curveY, smooth } from './curva'

/** O y da curva em 501 pontos de x, de 0 ao último ponto. */
const sample = (pts: [number, number][], bounds: [number, number]) => {
  const end = pts.at(-1)?.[0] ?? 0
  return Array.from({ length: 501 }, (_, i) =>
    curveY(pts, bounds, (i / 500) * end)
  )
}

describe('curva do painel', () => {
  // SVG: y cresce para baixo. Base em 100, dias de 2, 2, 0, 0, 1, 0.
  const base = 100
  const bounds: [number, number] = [0, base]
  const pts: [number, number][] = [2, 2, 0, 0, 1, 0].map((v, i) => [
    i * 10,
    base - v * 20
  ])
  const samples = sample(pts, bounds)

  it('passa por todos os pontos', () => {
    const d = smooth(pts, bounds)
    for (const [x, y] of pts)
      expect(d).toContain(`${x.toFixed(1)} ${y.toFixed(1)}`)
    for (const [x, y] of pts) expect(curveY(pts, bounds, x)).toBeCloseTo(y, 3)
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
    expect(curveY(pts, bounds, at)).toBe(topY)
  })

  it('dois dias iguais no topo não sobem acima do teto', () => {
    // Gráfico da Atividade diária: 900 × 260, topo dos dados em 16, base em
    // 236. Sem teto, o arredondado entre os dois dias de 100 subia a y ≈ -14,
    // fora do SVG.
    const H = 260
    const box: [number, number] = [4, H - 24]
    const top: [number, number][] = [0, 100, 100, 0].map((v, i) => [
      i * 300,
      H - 24 - (v / 100) * (H - 24 - 16)
    ])
    for (const y of sample(top, box)) {
      expect(y).toBeGreaterThanOrEqual(4)
      expect(y).toBeLessThanOrEqual(H - 24)
    }
    const d = smooth(top, box)
    for (const [, y] of d.matchAll(/(?:[MC ]|^)-?\d+\.\d (-?\d+\.\d)/g))
      expect(Number(y)).toBeGreaterThanOrEqual(4)
  })

  it('aguenta um ponto só e nenhum', () => {
    expect(smooth([[5, 5]], bounds)).toBe('M5.0 5.0')
    expect(smooth([], bounds)).toBe('')
    expect(curveY([[5, 5]], bounds, 5)).toBe(5)
  })
})
