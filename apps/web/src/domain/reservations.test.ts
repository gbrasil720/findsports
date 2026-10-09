import { describe, expect, test } from 'bun:test'
import {
  DUPLICATE_REQUEST_MESSAGE,
  type FanReservation,
  findActiveRequest,
  getCancelErrorMessage,
  getCreateErrorMessage,
  getStatusDetail,
  RESERVATION_STATUS_LABEL,
  SOLD_OUT_MESSAGE
} from './reservations'

const refusal = (code: string) => ({ data: { code } })

describe('getCreateErrorMessage', () => {
  const now = Date.parse('2026-10-01T12:00:00Z')
  const future = new Date(now + 60_000)
  const past = new Date(now - 60_000)

  test('pedido duplicado vira mensagem, não erro de banco', () => {
    expect(getCreateErrorMessage(refusal('CONFLICT'), future, now)).toBe(
      DUPLICATE_REQUEST_MESSAGE
    )
  })

  test('teto atingido no servidor vira o texto de esgotado', () => {
    expect(
      getCreateErrorMessage(refusal('UNPROCESSABLE_CONTENT'), future, now)
    ).toBe(SOLD_OUT_MESSAGE)
  })

  test('o horário do jogo separa jogo começado de bar sem recebimento', () => {
    expect(
      getCreateErrorMessage(refusal('PRECONDITION_FAILED'), past, now)
    ).toContain('já começou')
    expect(
      getCreateErrorMessage(refusal('PRECONDITION_FAILED'), future, now)
    ).toContain('não está recebendo reservas')
  })
})

describe('findActiveRequest', () => {
  const request = (id: string, eventId: string, status: string) =>
    ({ id, status, event: { id: eventId } }) as FanReservation
  const mine = [
    request('cancelado', 'jogo-a', 'cancelled'),
    request('recusado', 'jogo-a', 'declined'),
    request('expirado', 'jogo-a', 'expired'),
    request('confirmado', 'jogo-b', 'confirmed'),
    request('pendente', 'jogo-c', 'pending')
  ]

  test('só pendente e confirmado ocupam o jogo', () => {
    expect(findActiveRequest(mine, 'jogo-a')).toBeUndefined()
    expect(findActiveRequest(mine, 'jogo-b')?.id).toBe('confirmado')
    expect(findActiveRequest(mine, 'jogo-c')?.id).toBe('pendente')
  })

  test('sem a lista carregada não há o que avisar', () => {
    expect(findActiveRequest(undefined, 'jogo-b')).toBeUndefined()
  })
})

describe('getCancelErrorMessage', () => {
  test('recusa conhecida tem texto próprio', () => {
    expect(getCancelErrorMessage(refusal('NOT_FOUND'))).toBe(
      'Reserva não encontrada.'
    )
  })
})

describe('getStatusDetail', () => {
  test('confirmada antes do fim do jogo manda mostrar o código ao chegar', () => {
    expect(getStatusDetail({ status: 'confirmed', code: 'QXUNQM' })).toContain(
      'ao chegar'
    )
  })

  // WEB-322: depois do jogo ninguém mais "chega", e a ADR 0003 não julga.
  test('jogo encerrado não manda chegar nem acusa falta', () => {
    const open = getStatusDetail({ status: 'ended', code: 'QXUNQM' })
    const closed = getStatusDetail({ status: 'ended', code: null })
    expect(RESERVATION_STATUS_LABEL.ended).toBe('Jogo encerrado')
    expect(open).toContain('ainda vale')
    expect(closed).toContain('não vale mais')
    for (const text of [open, closed]) {
      expect(text).not.toMatch(/chegar|compareceu/)
    }
  })
})
