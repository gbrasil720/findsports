import { describe, expect, test } from 'bun:test'
import { TRPCError } from '@trpc/server'
import {
  assertCanValidateReservations,
  assertReservationConfirmed,
  assertWindowOpen,
  codeNotFoundError,
  translateArrivalWriteError
} from './reservation-validation'

const HOUR = 3_600_000
const now = new Date('2026-09-12T21:00:00.000Z')
const future = new Date(now.getTime() + 24 * HOUR)
const past = new Date(now.getTime() - 24 * HOUR)

describe('assertCanValidateReservations', () => {
  const allows = (
    subscription: Parameters<typeof assertCanValidateReservations>[0]
  ) => {
    try {
      assertCanValidateReservations(subscription, now)
      return true
    } catch (error) {
      expect(error).toMatchObject({ code: 'FORBIDDEN' })
      return false
    }
  }

  test('Elite ativo ou em trial vigente valida', () => {
    expect(
      allows({ plan: 'elite', status: 'active', currentPeriodEnd: null })
    ).toBe(true)
    expect(
      allows({ plan: 'elite', status: 'trialing', currentPeriodEnd: future })
    ).toBe(true)
  })

  test('sem assinatura, outro plano, trial vencido ou cobrança pendente não', () => {
    expect(allows(null)).toBe(false)
    expect(
      allows({ plan: 'pro', status: 'active', currentPeriodEnd: future })
    ).toBe(false)
    expect(
      allows({ plan: 'elite', status: 'trialing', currentPeriodEnd: past })
    ).toBe(false)
    expect(
      allows({ plan: 'elite', status: 'past_due', currentPeriodEnd: future })
    ).toBe(false)
  })
})

describe('assertReservationConfirmed', () => {
  test('só reserva confirmada registra chegada', () => {
    expect(() => assertReservationConfirmed('confirmed')).not.toThrow()
    for (const status of ['pending', 'declined', 'cancelled'] as const) {
      expect(() => assertReservationConfirmed(status)).toThrow(
        expect.objectContaining({ code: 'UNPROCESSABLE_CONTENT' })
      )
    }
  })
})

describe('assertWindowOpen', () => {
  const event = {
    startsAt: new Date('2026-09-12T19:00:00.000Z'),
    endsAt: null
  }
  const opensAt = new Date('2026-09-12T16:00:00.000Z')
  const closesAt = new Date('2026-09-13T01:00:00.000Z')

  test('abre 3h antes e fecha 3h depois do fim derivado, inclusive', () => {
    expect(() => assertWindowOpen(event, opensAt)).not.toThrow()
    expect(() => assertWindowOpen(event, closesAt)).not.toThrow()
  })

  test('diz quando o código passa a valer, no horário de Brasília', () => {
    expect(() =>
      assertWindowOpen(event, new Date(opensAt.getTime() - 1))
    ).toThrow(
      expect.objectContaining({
        code: 'PRECONDITION_FAILED',
        message: expect.stringMatching(/ainda não abriu.*12\/09,? 13:00/)
      })
    )
  })

  test('diz até quando o código valia', () => {
    expect(() =>
      assertWindowOpen(event, new Date(closesAt.getTime() + 1))
    ).toThrow(
      expect.objectContaining({
        code: 'PRECONDITION_FAILED',
        message: expect.stringMatching(/expirou.*12\/09,? 22:00/)
      })
    )
  })

  test('fim informado pelo bar desloca o fechamento', () => {
    const shorter = { ...event, endsAt: new Date('2026-09-12T21:00:00.000Z') }
    const midnight = new Date('2026-09-13T00:00:00.000Z')
    expect(() => assertWindowOpen(shorter, midnight)).not.toThrow()
    expect(() =>
      assertWindowOpen(shorter, new Date(midnight.getTime() + 1))
    ).toThrow()
  })
})

describe('translateArrivalWriteError', () => {
  // O driver embrulha o erro do Postgres; o código vem em `cause`.
  const pgError = (constraint: string, code = '23514') =>
    Object.assign(new Error('query failed'), {
      cause: Object.assign(new Error('pg'), { code, constraint })
    })

  test('estouro de max_uses vira CONFLICT com a quantidade', () => {
    const many = translateArrivalWriteError(
      pgError('reservation_code_used_count_bounds'),
      4
    )
    expect(many).toBeInstanceOf(TRPCError)
    expect(many).toMatchObject({
      code: 'CONFLICT',
      message: 'As 4 pessoas desta reserva já foram validadas.'
    })
    expect(
      translateArrivalWriteError(
        pgError('reservation_code_used_count_bounds'),
        1
      )?.message
    ).toBe('A única pessoa desta reserva já foi validada.')
  })

  test('código aposentado no meio do caminho responde como inexistente', () => {
    const retired = translateArrivalWriteError(
      pgError('reservation_code_use_code_not_retired'),
      2
    )
    const missing = codeNotFoundError()
    expect(retired).toMatchObject({
      code: missing.code,
      message: missing.message
    })
  })

  test('o que não é regra conhecida segue adiante sem tradução', () => {
    expect(
      translateArrivalWriteError(pgError('outra_regra_qualquer'), 2)
    ).toBeNull()
    expect(
      translateArrivalWriteError(
        pgError('reservation_code_used_count_bounds', '23505'),
        2
      )
    ).toBeNull()
    expect(translateArrivalWriteError(new Error('rede caiu'), 2)).toBeNull()
  })
})
