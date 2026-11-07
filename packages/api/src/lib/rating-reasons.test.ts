import { expect, test } from 'bun:test'
import { ratingReasonsSchema, summarizeReasons } from './rating-reasons'

test('resumo separa a favor e contra, mais citado primeiro, até três', () => {
  const summary = summarizeReasons([
    { wouldReturn: true, reason: 'screen', count: 5 },
    { wouldReturn: true, reason: 'sound', count: 2 },
    { wouldReturn: true, reason: 'food', count: 2 },
    { wouldReturn: true, reason: 'service', count: 1 },
    { wouldReturn: false, reason: 'crowded', count: 3 },
    { wouldReturn: false, reason: 'price', count: 1 }
  ])
  // Empate (som e comida) segue a ordem da tela: som vem antes.
  expect(summary).toEqual({
    positive: ['screen', 'sound', 'food'],
    negative: ['crowded', 'price']
  })
})

test('etiqueta fora do vocabulário não entra no resumo', () => {
  expect(
    summarizeReasons([{ wouldReturn: true, reason: 'clima', count: 9 }])
  ).toEqual({ positive: [], negative: [] })
})

test('entrada tira repetida e segue a ordem da tela', () => {
  expect(ratingReasonsSchema.parse(['food', 'screen', 'food'])).toEqual([
    'screen',
    'food'
  ])
  expect(ratingReasonsSchema.safeParse(['clima']).success).toBe(false)
})
