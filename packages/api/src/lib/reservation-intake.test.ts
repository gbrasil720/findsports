import { describe, expect, test } from 'bun:test'
import { TRPCError } from '@trpc/server'
import {
  assertCanEnableReservations,
  assertReceivesReservations,
  receivesReservations
} from './reservation-intake'

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

describe('receivesReservations', () => {
  test('precisa querer e poder', () => {
    expect(receivesReservations(true, elite, now)).toBe(true)
    expect(receivesReservations(false, elite, now)).toBe(false)
    expect(
      receivesReservations(
        true,
        { plan: 'pro', status: 'active', currentPeriodEnd: null },
        now
      )
    ).toBe(false)
    expect(receivesReservations(true, null, now)).toBe(false)
  })
})

describe('assertReceivesReservations', () => {
  test('recebimento desligado recusa pedido novo com erro útil', () => {
    try {
      assertReceivesReservations(false, elite, now)
      throw new Error('deveria ter recusado')
    } catch (error) {
      expect(error).toBeInstanceOf(TRPCError)
      expect((error as TRPCError).code).toBe('PRECONDITION_FAILED')
      expect((error as TRPCError).message).toContain('não está recebendo')
    }
  })

  test('recebimento ligado com Elite passa', () => {
    expect(
      codeOf(() => assertReceivesReservations(true, elite, now))
    ).toBeNull()
  })
})
