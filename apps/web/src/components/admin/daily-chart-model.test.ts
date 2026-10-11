import { describe, expect, test } from 'bun:test'
import { buildSeries, niceMax, tickIndexes } from './daily-chart-model'

/** Todos os `y` de um caminho: `M`/`L` e os três pontos de cada `C`. */
const ysOf = (path: string) =>
  [...path.matchAll(/-?[\d.]+,(-?[\d.]+)/g)].map((match) => Number(match[1]))

describe('gráfico de atividade diária', () => {
  test('a curva suave não inventa pico nem vale', () => {
    const values = [0, 0, 40, 5, 5, 38, 39, 2, 60, 0]
    const { ys, runs } = buildSeries(values, 60)
    const [lowest, highest] = [Math.min(...ys), Math.max(...ys)]

    for (const y of runs.flatMap((run) => ysOf(run.line))) {
      // Nenhum ponto de controle sai da faixa dos dados.
      expect(y).toBeGreaterThanOrEqual(lowest)
      expect(y).toBeLessThanOrEqual(highest)
    }
  })

  test('só o trecho em que o valor sobe é marcado como subida', () => {
    const { runs } = buildSeries([10, 20, 30, 30, 5, 6], 40)
    // Subida de dois dias junta num trecho só; empate e queda juntam em outro.
    expect(runs.map((run) => run.up)).toEqual([true, false, true])
    // A área do trecho fecha na base do gráfico.
    expect(runs[0]?.area.startsWith('M0,100L0,75')).toBe(true)
    expect(runs[0]?.area.endsWith('L40,100Z')).toBe(true)
  })

  test('um dia só não quebra: sem linha, ponto no meio', () => {
    expect(buildSeries([7], 8)).toEqual({ xs: [50], ys: [12.5], runs: [] })
  })

  test('escala e marcações do eixo', () => {
    expect([1, 3, 50, 51, 120, 1025].map(niceMax)).toEqual([
      2, 4, 60, 60, 200, 2000
    ])
    expect(tickIndexes(30)).toEqual([0, 7, 15, 22, 29])
    expect(tickIndexes(2)).toEqual([0, 1])
    expect(tickIndexes(1)).toEqual([0])
  })
})
