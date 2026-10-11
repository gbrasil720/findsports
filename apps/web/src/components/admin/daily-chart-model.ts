/*
 * Geometria do gráfico "Atividade diária". Tudo em coordenadas de um viewBox
 * 0–100 nos dois eixos: o SVG estica com `preserveAspectRatio="none"` e o
 * traço não deforma (`vector-effect`), então a largura da tela não entra aqui.
 */

const round = (value: number) => Math.round(value * 100) / 100

/** Teto "redondo" da escala. O meio da escala também sai inteiro. */
export function niceMax(max: number): number {
  if (max <= 2) return 2
  const power = 10 ** Math.floor(Math.log10(max))
  return (
    [1, 2, 4, 6, 8, 10].map((m) => m * power).find((v) => v >= max) ??
    10 * power
  )
}

/**
 * Tangentes da interpolação cúbica monótona (Fritsch–Carlson). É o que deixa
 * a curva suave sem inventar pico: entre dois dias ela nunca passa do maior
 * nem fica abaixo do menor dos dois valores.
 */
function monotoneTangents(xs: number[], ys: number[]): number[] {
  const last = xs.length - 1
  const secants = xs
    .slice(1)
    .map((x, i) => ((ys[i + 1] ?? 0) - (ys[i] ?? 0)) / (x - (xs[i] ?? 0)))
  const secant = (i: number) => secants[i] ?? 0
  const tangents = ys.map((_, i) =>
    i === 0
      ? secant(0)
      : i === last
        ? secant(last - 1)
        : secant(i - 1) * secant(i) <= 0
          ? 0
          : (secant(i - 1) + secant(i)) / 2
  )
  for (let i = 0; i < last; i++) {
    const d = secant(i)
    if (d === 0) {
      tangents[i] = 0
      tangents[i + 1] = 0
      continue
    }
    const a = (tangents[i] ?? 0) / d
    const b = (tangents[i + 1] ?? 0) / d
    const length = Math.hypot(a, b)
    if (length > 3) {
      tangents[i] = ((3 * a) / length) * d
      tangents[i + 1] = ((3 * b) / length) * d
    }
  }
  return tangents
}

export type ChartRun = {
  /** O valor sobe do começo ao fim do trecho. */
  up: boolean
  /** Linha do trecho. */
  line: string
  /** A mesma linha fechada até a base, para preencher. */
  area: string
}

/**
 * Pontos de uma série e a curva dela, partida em trechos seguidos de mesma
 * direção: subida de um lado, queda e empate do outro. É essa divisão que
 * deixa pintar só a subida.
 */
export function buildSeries(
  values: number[],
  top: number
): { xs: number[]; ys: number[]; runs: ChartRun[] } {
  const count = values.length
  const xs = values.map((_, i) => (count === 1 ? 50 : (i / (count - 1)) * 100))
  const ys = values.map((value) => 100 - (value / top) * 100)
  const tangents = count > 1 ? monotoneTangents(xs, ys) : [0]

  const open: { up: boolean; x0: number; x1: number; d: string }[] = []
  for (let i = 0; i < count - 1; i++) {
    const [x0, x1] = [xs[i] ?? 0, xs[i + 1] ?? 0]
    const [y0, y1] = [ys[i] ?? 0, ys[i + 1] ?? 0]
    const third = (x1 - x0) / 3
    const curve = `C${round(x0 + third)},${round(y0 + (tangents[i] ?? 0) * third)} ${round(x1 - third)},${round(y1 - (tangents[i + 1] ?? 0) * third)} ${round(x1)},${round(y1)}`
    const up = (values[i + 1] ?? 0) > (values[i] ?? 0)
    const previous = open.at(-1)
    if (previous && previous.up === up) {
      previous.d += curve
      previous.x1 = x1
    } else {
      open.push({ up, x0, x1, d: `${round(x0)},${round(y0)}${curve}` })
    }
  }

  return {
    xs,
    ys,
    runs: open.map(({ up, x0, x1, d }) => ({
      up,
      line: `M${d}`,
      area: `M${round(x0)},100L${d}L${round(x1)},100Z`
    }))
  }
}

/** Até `max` posições espalhadas pela série, sempre com a primeira e a última. */
export function tickIndexes(count: number, max = 5): number[] {
  const ticks = Math.min(count, max)
  return [
    ...new Set(
      Array.from({ length: ticks }, (_, i) =>
        Math.round((i * (count - 1)) / Math.max(ticks - 1, 1))
      )
    )
  ]
}
