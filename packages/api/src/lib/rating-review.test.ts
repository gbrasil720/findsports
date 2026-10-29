import { expect, test } from 'bun:test'
import { ratingDetailsSchema, starsAverage } from './rating-review'

test('comentário: espaço sobrando sai, vazio vira nenhum, longo é recusado', () => {
  expect(ratingDetailsSchema.parse({ stars: 4, comment: '  Bom.  ' })).toEqual({
    stars: 4,
    comment: 'Bom.',
    identified: false
  })
  expect(
    ratingDetailsSchema.parse({ stars: 4, comment: '   ' }).comment
  ).toBeNull()
  expect(ratingDetailsSchema.parse({ stars: 4 }).comment).toBeNull()
  expect(() =>
    ratingDetailsSchema.parse({ stars: 4, comment: 'x'.repeat(281) })
  ).toThrow()
})

test('estrelas só de 1 a 5, inteiras', () => {
  for (const stars of [0, 6, 4.5]) {
    expect(() => ratingDetailsSchema.parse({ stars })).toThrow()
  }
})

test('média com uma casa, e nada abaixo do piso', () => {
  expect(starsAverage(13, 3, 3)).toBe(4.3)
  expect(starsAverage(10, 2, 3)).toBeNull()
  expect(starsAverage(0, 0, 0)).toBeNull()
})
