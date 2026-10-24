import { describe, expect, test } from 'bun:test'
import { buildSeries, niceMax, tickIndexes } from './daily-chart-model'

describe('gráfico de atividade diária', () => {
  test('segmentos retos de um dia ao outro, sem curva', () => {
    const { runs } = buildSeries([0, 40, 20], 40)
    expect(runs.map((run) => run.line)).toEqual(['M0,100L50,0', 'M50,0L100,50'])
    expect(runs.some((run) => run.line.includes('C'))).toBe(false)
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
