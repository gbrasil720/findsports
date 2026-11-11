import { describe, expect, test } from 'bun:test'
import { guideItems, tourSteps } from './bar-tour'

const fresh = {
  published: 1,
  planChosen: true,
  cover: false,
  hours: false,
  elite: true
}

describe('passeio do bar', () => {
  test('Elite vê 6 telas; Starter e Pro, 4', () => {
    expect(tourSteps(guideItems(fresh, {}), true)).toEqual([
      'hoje',
      'validar',
      'jogos',
      'quemvai',
      'espaco',
      'desempenho'
    ])
    const starter = { ...fresh, elite: false }
    expect(tourSteps(guideItems(starter, {}), false)).toEqual([
      'hoje',
      'jogos',
      'espaco',
      'desempenho'
    ])
  })

  test('o que está feito sai, menos Hoje e Desempenho', () => {
    const items = guideItems(
      { ...fresh, published: 3, cover: true, hours: true },
      { codigo: true }
    )
    expect(tourSteps(items, true)).toEqual(['hoje', 'quemvai', 'desempenho'])
  })

  test('continuar segue das telas não vistas; tudo visto recomeça', () => {
    const items = guideItems(fresh, {})
    expect(tourSteps(items, true, ['hoje', 'validar'])).toEqual([
      'jogos',
      'quemvai',
      'espaco',
      'desempenho'
    ])
    expect(
      tourSteps(items, true, [
        'hoje',
        'validar',
        'jogos',
        'quemvai',
        'espaco',
        'desempenho'
      ])
    ).toHaveLength(6)
  })

  test('o código de exemplo só é item no Elite', () => {
    expect(
      guideItems({ ...fresh, elite: false }, {}).map((i) => i.id)
    ).not.toContain('codigo')
    expect(guideItems(fresh, { codigo: true }).at(-1)).toEqual({
      id: 'codigo',
      done: true
    })
  })
})
