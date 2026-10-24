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

export type ChartRun = {
  /** O valor sobe do começo ao fim do trecho. */
  up: boolean
  /** Linha do trecho. */
  line: string
  /** A mesma linha fechada até a base, para preencher. */
  area: string
}

/**
 * Pontos de uma série e a linha dela, em segmentos retos de um dia ao outro
 * (`dchart` do design), partida em trechos seguidos de mesma direção: subida
 * de um lado, queda e empate do outro. É essa divisão que deixa pintar só a
 * subida.
 */
export function buildSeries(
  values: number[],
  top: number
): { xs: number[]; ys: number[]; runs: ChartRun[] } {
  const count = values.length
  const xs = values.map((_, i) => (count === 1 ? 50 : (i / (count - 1)) * 100))
  const ys = values.map((value) => 100 - (value / top) * 100)

  const open: { up: boolean; x0: number; x1: number; d: string }[] = []
  for (let i = 0; i < count - 1; i++) {
    const [x0, x1] = [xs[i] ?? 0, xs[i + 1] ?? 0]
    const [y0, y1] = [ys[i] ?? 0, ys[i + 1] ?? 0]
    const segment = `L${round(x1)},${round(y1)}`
    const up = (values[i + 1] ?? 0) > (values[i] ?? 0)
    const previous = open.at(-1)
    if (previous && previous.up === up) {
      previous.d += segment
      previous.x1 = x1
    } else {
      open.push({ up, x0, x1, d: `${round(x0)},${round(y0)}${segment}` })
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
