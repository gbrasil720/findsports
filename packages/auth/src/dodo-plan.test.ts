import { describe, expect, test } from 'bun:test'
import { dodoEnvironment, planForProduct } from './dodo-plan'

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

describe('dodoEnvironment', () => {
  test('sem configuração, segue o NODE_ENV', () => {
    expect(dodoEnvironment(undefined, 'production')).toBe('live_mode')
    expect(dodoEnvironment(undefined, 'development')).toBe('test_mode')
    expect(dodoEnvironment(undefined, 'test')).toBe('test_mode')
  })

  test('configurado vence o NODE_ENV (preview em produção usa teste)', () => {
    expect(dodoEnvironment('test_mode', 'production')).toBe('test_mode')
    expect(dodoEnvironment('live_mode', 'development')).toBe('live_mode')
  })
})
