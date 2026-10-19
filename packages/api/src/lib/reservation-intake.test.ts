import { describe, expect, test } from 'bun:test'
import { TRPCError } from '@trpc/server'
import { assertCanEnableReservations } from './reservation-intake'

const now = new Date('2026-09-29T12:00:00.000Z')
const tomorrow = new Date('2026-09-30T12:00:00.000Z')
const yesterday = new Date('2026-09-28T12:00:00.000Z')

const elite = {
  plan: 'elite' as const,
  status: 'active' as const,
  currentPeriodEnd: null
}

function codeOf(fn: () => void) {
  try {
    fn()
  } catch (error) {
    expect(error).toBeInstanceOf(TRPCError)
    return (error as TRPCError).code
  }
  return null
}

describe('assertCanEnableReservations', () => {
  test('Elite ativo ou em trial vigente liga', () => {
    expect(codeOf(() => assertCanEnableReservations(elite, now))).toBeNull()
    expect(
      codeOf(() =>
        assertCanEnableReservations(
          { plan: 'elite', status: 'trialing', currentPeriodEnd: tomorrow },
          now
        )
      )
    ).toBeNull()
  })

  test.each([
    { plan: 'starter', status: 'active', currentPeriodEnd: null },
    { plan: 'pro', status: 'active', currentPeriodEnd: null },
    { plan: 'elite', status: 'past_due', currentPeriodEnd: tomorrow },
    { plan: 'elite', status: 'trialing', currentPeriodEnd: yesterday },
    null
  ] as const)('sem Elite vigente recusa com FORBIDDEN: %p', (sub) => {
    expect(codeOf(() => assertCanEnableReservations(sub, now))).toBe(
      'FORBIDDEN'
    )
  })
})
