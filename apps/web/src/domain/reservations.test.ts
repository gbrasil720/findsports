import { describe, expect, test } from 'bun:test'
import {
  DUPLICATE_REQUEST_MESSAGE,
  getCancelErrorMessage,
  getCreateErrorMessage
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

  test('o horário do jogo separa jogo começado de bar sem recebimento', () => {
    expect(
      getCreateErrorMessage(refusal('PRECONDITION_FAILED'), past, now)
    ).toContain('já começou')
    expect(
      getCreateErrorMessage(refusal('PRECONDITION_FAILED'), future, now)
    ).toContain('não está recebendo reservas')
  })
})

describe('getCancelErrorMessage', () => {
  test('recusa conhecida tem texto próprio', () => {
    expect(getCancelErrorMessage(refusal('NOT_FOUND'))).toBe(
      'Reserva não encontrada.'
    )
  })
})
