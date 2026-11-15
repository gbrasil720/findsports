import { describe, expect, test } from 'bun:test'

import { recommenderVariant } from './ai-round'

const people = Array.from({ length: 2000 }, (_, i) => `user-${i}`)

describe('recommender A × C draw', () => {
  test('is fixed per person', () => {
    for (const id of people.slice(0, 50))
      expect(recommenderVariant(id, { a: 50, c: 50 })).toBe(
        recommenderVariant(id, { a: 50, c: 50 })
      )
  })

  test('splits by the weights of A and C', () => {
    const c = people.filter(
      (id) => recommenderVariant(id, { a: 50, c: 50 }) === 'c'
    ).length
    expect(c / people.length).toBeGreaterThan(0.45)
    expect(c / people.length).toBeLessThan(0.55)
    expect(
      people.every((id) => recommenderVariant(id, { a: 100, c: 0 }) === 'a')
    ).toBe(true)
    expect(
      people.every((id) => recommenderVariant(id, { a: 0, c: 100 }) === 'c')
    ).toBe(true)
  })

  test('ignores the weight left for B (Jev left the test)', () => {
    const weights = { a: 34, b: 33, c: 33 }
    for (const id of people) {
      const arm = recommenderVariant(id, weights)
      expect(arm === 'a' || arm === 'c').toBe(true)
    }
  })
})
