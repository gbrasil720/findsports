import { describe, expect, test } from 'bun:test'
import { planForProduct } from './dodo-plan'

describe('planForProduct', () => {
  test('mapeia os três produtos conhecidos', () => {
    expect(planForProduct('pdt_0NgxgZyV3AKsNe99Ae2ZN')).toBe('starter')
    expect(planForProduct('pdt_0NgxglMLDZdpaXIuRAiCE')).toBe('pro')
    expect(planForProduct('pdt_0NgxgzP6hnGWg1brokOcU')).toBe('elite')
  })

  test('produto desconhecido ou ausente não vira Starter', () => {
    for (const id of ['pdt_inexistente', '', undefined, 'toString']) {
      expect(planForProduct(id)).toBeNull()
    }
  })
})
