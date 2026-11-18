/**
 * Curva suave dos gráficos do painel (Hoje e Desempenho), cúbica monótona
 * (Fritsch–Carlson, a `curveMonotoneX` do d3). Passa por todos os pontos e
 * não passa deles: o pico da curva é o pico do dia (o cursor, que para nos
 * dias, encosta nele) e o zero não afunda abaixo da linha de base. A curva
 * anterior (Catmull-Rom) subia antes do pico e descia abaixo do zero.
 */
export function smooth(points: [number, number][]): string {
  const n = points.length
  const [first] = points
  if (!first) return ''
  const p = (i: number) => points[i] as [number, number]
  // Inclinação de cada trecho e tangente em cada ponto.
  const s = Array.from({ length: n - 1 }, (_, i) => {
    const dx = p(i + 1)[0] - p(i)[0]
    return dx ? (p(i + 1)[1] - p(i)[1]) / dx : 0
  })
  const m = points.map((_, i) => {
    const a = s[i - 1]
    const b = s[i]
    if (a === undefined) return b ?? 0
    if (b === undefined) return a
    return a * b > 0 ? (a + b) / 2 : 0
  })
  for (let i = 0; i < n - 1; i++) {
    const si = s[i] as number
    if (si === 0) {
      m[i] = 0
      m[i + 1] = 0
      continue
    }
    const a = (m[i] as number) / si
    const b = (m[i + 1] as number) / si
    const h = a * a + b * b
    if (h > 9) {
      const t = 3 / Math.sqrt(h)
      m[i] = t * a * si
      m[i + 1] = t * b * si
    }
  }
  const f = (v: number) => v.toFixed(1)
  let d = `M${f(first[0])} ${f(first[1])}`
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = p(i)
    const [x1, y1] = p(i + 1)
    const k = (x1 - x0) / 3
    d += ` C${f(x0 + k)} ${f(y0 + (m[i] as number) * k)} ${f(x1 - k)} ${f(y1 - (m[i + 1] as number) * k)} ${f(x1)} ${f(y1)}`
  }
  return d
}
