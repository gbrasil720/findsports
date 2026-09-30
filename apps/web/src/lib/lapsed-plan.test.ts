import { describe, expect, test } from 'bun:test'
import { getLapsedPlan } from './lapsed-plan'

describe('getLapsedPlan', () => {
  test('past_due é plano parado', () => {
    expect(
      getLapsedPlan({ plan: 'pro', status: 'past_due', currentPlan: null })
    ).toEqual({ plan: 'pro', reason: 'past_due' })
  })

  // O servidor já zerou `currentPlan`: o trial venceu.
  test('trialing sem plano vigente é trial encerrado', () => {
    expect(
      getLapsedPlan({ plan: 'elite', status: 'trialing', currentPlan: null })
    ).toEqual({ plan: 'elite', reason: 'trial_ended' })
  })

  test('plano vigente, encerrado ou ausente não é parado', () => {
    expect(
      getLapsedPlan({ plan: 'pro', status: 'active', currentPlan: 'pro' })
    ).toBeNull()
    expect(
      getLapsedPlan({ plan: 'pro', status: 'trialing', currentPlan: 'pro' })
    ).toBeNull()
    for (const status of ['inactive', 'cancelled']) {
      expect(
        getLapsedPlan({ plan: 'pro', status, currentPlan: null })
      ).toBeNull()
    }
    expect(getLapsedPlan(null)).toBeNull()
  })
})
