type Pt = [number, number]

/**
 * Trechos da curva dos gráficos do painel (Hoje e Desempenho): a curva
 * redonda do protótipo (Catmull-Rom), com os pontos de controle presos acima
 * do `floor` (o y da linha de base no SVG, que cresce para baixo). A curva
 * fica dentro dos controles, então não afunda abaixo do zero antes de subir
 * nem depois de descer.
 */
function segments(points: Pt[], floor: number): [Pt, Pt, Pt, Pt][] {
  const cap = (y: number) => Math.min(floor, y)
  const t = 0.18
  return points.slice(0, -1).map((p1, i) => {
    const p0 = points[i - 1] ?? p1
    const p2 = points[i + 1] as Pt
    const p3 = points[i + 2] ?? p2
    return [
      p1,
      [p1[0] + (p2[0] - p0[0]) * t, cap(p1[1] + (p2[1] - p0[1]) * t)],
      [p2[0] - (p3[0] - p1[0]) * t, cap(p2[1] - (p3[1] - p1[1]) * t)],
      p2
    ]
  })
}

/** Caminho SVG que passa por todos os pontos. */
export function smooth(points: Pt[], floor: number): string {
  const [first] = points
  if (!first) return ''
  const f = (v: number) => v.toFixed(1)
  let d = `M${f(first[0])} ${f(first[1])}`
  for (const [, c1, c2, p2] of segments(points, floor)) {
    d += ` C${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(p2[0])} ${f(p2[1])}`
  }
  return d
}

const bez = (a: number, b: number, c: number, d: number, t: number) => {
  const u = 1 - t
  return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d
}

/**
 * O y da curva no `x`, para o ponto do cursor andar por cima dela (e encostar
 * no topo, que pode cair entre dois dias). O x de cada trecho cresce com o
 * parâmetro, então a busca binária acha o ponto.
 */
export function curveY(points: Pt[], floor: number, x: number): number {
  const segs = segments(points, floor)
  const seg = segs.find(([, , , p2]) => x <= p2[0]) ?? segs.at(-1)
  if (!seg) return points[0]?.[1] ?? floor
  const [p1, c1, c2, p2] = seg
  let lo = 0
  let hi = 1
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2
    if (bez(p1[0], c1[0], c2[0], p2[0], mid) < x) lo = mid
    else hi = mid
  }
  return bez(p1[1], c1[1], c2[1], p2[1], (lo + hi) / 2)
}
