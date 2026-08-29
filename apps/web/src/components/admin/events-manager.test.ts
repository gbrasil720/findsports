import { describe, expect, test } from 'bun:test'

import type { PolicyState } from './admin-model'
import { getCreateBlockReason } from './events-manager'

const PERIOD = {
  periodStart: '2026-08-01T00:00:00.000Z',
  periodEnd: '2026-09-01T00:00:00.000Z'
}

function reason(state: PolicyState): string | null {
  return getCreateBlockReason(state)
}

describe('event create availability', () => {
  test('blocks while loading and exposes retry on error state', () => {
    expect(reason({ status: 'loading' })).toBe('Verificando disponibilidade…')
    expect(reason({ status: 'error', retry: () => {} })).toBe(
      'Não foi possível verificar a disponibilidade.'
    )
  })

  test('blocks inactive bars and Starter at the limit', () => {
    expect(
      reason({
        status: 'ready',
        policy: {
          status: 'inactive',
          canCreate: false,
          plan: 'starter'
        }
      })
    ).toBe('Ative um plano para adicionar eventos.')
    expect(
      reason({
        status: 'ready',
        policy: {
          status: 'limited',
          canCreate: false,
          plan: 'starter',
          limit: 5,
          used: 5,
          remaining: 0,
          ...PERIOD
        }
      })
    ).toBe('Limite do plano atingido.')
  })

  test('allows available Starter, Pro and Elite policies', () => {
    expect(
      reason({
        status: 'ready',
        policy: {
          status: 'limited',
          canCreate: true,
          plan: 'starter',
          limit: 5,
          used: 4,
          remaining: 1,
          ...PERIOD
        }
      })
    ).toBeNull()
    for (const plan of ['pro', 'elite'] as const) {
      expect(
        reason({
          status: 'ready',
          policy: { status: 'unlimited', canCreate: true, plan }
        })
      ).toBeNull()
    }
  })
})
