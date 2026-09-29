import { describe, expect, test } from 'bun:test'
import { TRPCError } from '@trpc/server'
import {
  assertCanValidateReservations,
  assertReservationConfirmed,
  assertWindowOpen,
  canValidateReservations,
  codeNotFoundError,
  getValidationWindowState,
  translateArrivalWriteError
} from './reservation-validation'

const HOUR = 3_600_000
const now = new Date('2026-09-12T21:00:00.000Z')
const future = new Date(now.getTime() + 24 * HOUR)
const past = new Date(now.getTime() - 24 * HOUR)

describe('canValidateReservations', () => {
  test('Elite ativo ou em trial vigente valida', () => {
    expect(
      canValidateReservations(
        { plan: 'elite', status: 'active', currentPeriodEnd: null },
        now
      )
    ).toBe(true)
    expect(
      canValidateReservations(
        { plan: 'elite', status: 'trialing', currentPeriodEnd: future },
        now
      )
    ).toBe(true)
  })

  test('sem assinatura, outro plano, trial vencido ou cobrança pendente não', () => {
    expect(canValidateReservations(null, now)).toBe(false)
    expect(
      canValidateReservations(
        { plan: 'pro', status: 'active', currentPeriodEnd: future },
        now
      )
    ).toBe(false)
    expect(
      canValidateReservations(
        { plan: 'elite', status: 'trialing', currentPeriodEnd: past },
        now
      )
    ).toBe(false)
    expect(
      canValidateReservations(
        { plan: 'elite', status: 'past_due', currentPeriodEnd: future },
        now
      )
    ).toBe(false)
  })

  test('a recusa é FORBIDDEN', () => {
    expect(() => assertCanValidateReservations(null, now)).toThrow(
      expect.objectContaining({ code: 'FORBIDDEN' })
    )
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

describe('getValidationWindowState', () => {
  const event = {
    startsAt: new Date('2026-09-12T19:00:00.000Z'),
    endsAt: null
  }

  test('abre 3h antes e fecha 3h depois do fim derivado, inclusive', () => {
    const opensAt = new Date('2026-09-12T16:00:00.000Z')
    const closesAt = new Date('2026-09-13T01:00:00.000Z')

    expect(getValidationWindowState(event, opensAt)).toEqual({
      status: 'open',
      opensAt,
      closesAt
    })
    expect(getValidationWindowState(event, closesAt).status).toBe('open')
    expect(
      getValidationWindowState(event, new Date(opensAt.getTime() - 1)).status
    ).toBe('not_open')
    expect(
      getValidationWindowState(event, new Date(closesAt.getTime() + 1)).status
    ).toBe('closed')
  })

  test('fim informado pelo bar desloca o fechamento', () => {
    const state = getValidationWindowState(
      { ...event, endsAt: new Date('2026-09-12T21:00:00.000Z') },
      now
    )
    expect(state.closesAt).toEqual(new Date('2026-09-13T00:00:00.000Z'))
  })
})

describe('assertWindowOpen', () => {
  const opensAt = new Date('2026-09-12T16:00:00.000Z')
  const closesAt = new Date('2026-09-13T01:00:00.000Z')

  test('janela aberta passa', () => {
    expect(() =>
      assertWindowOpen({ status: 'open', opensAt, closesAt })
    ).not.toThrow()
  })

  test('diz quando o código passa a valer, no horário de Brasília', () => {
    expect(() =>
      assertWindowOpen({ status: 'not_open', opensAt, closesAt })
    ).toThrow(
      expect.objectContaining({
        code: 'PRECONDITION_FAILED',
        message: expect.stringMatching(/ainda não abriu.*12\/09,? 13:00/)
      })
    )
  })

  test('diz até quando o código valia', () => {
    expect(() =>
      assertWindowOpen({ status: 'closed', opensAt, closesAt })
    ).toThrow(
      expect.objectContaining({
        code: 'PRECONDITION_FAILED',
        message: expect.stringMatching(/expirou.*12\/09,? 22:00/)
      })
    )
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
