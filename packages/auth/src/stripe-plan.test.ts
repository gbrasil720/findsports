import { expect, test } from 'bun:test'
import { planForLookupKey, STRIPE_PLANS } from './stripe-plan'

test('cada plano tem a sua lookup key', () => {
  expect(STRIPE_PLANS.map((p) => p.name)).toEqual(['starter', 'pro', 'elite'])
  for (const plan of STRIPE_PLANS) {
    expect(planForLookupKey(plan.lookupKey)).toBe(plan.name)
  }
})

test('preço ausente ou desconhecido não vira plano nenhum', () => {
  expect(planForLookupKey(undefined)).toBeNull()
  expect(planForLookupKey(null)).toBeNull()
  expect(planForLookupKey('elite_yearly')).toBeNull()
})
