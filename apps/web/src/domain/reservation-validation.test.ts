import { describe, expect, test } from 'bun:test'
import {
  getAllValidatedMessage,
  getArrivalBlocker,
  getArrivalErrorMessage,
  getCounterLabel,
  getGameTitle,
  getLookupErrorMessage,
  getUndoErrorMessage,
  getWindowMessage,
  getWindowStatus,
  wasAnsweredByServer
} from './reservation-validation'

const trpcError = (code: string, message = 'texto do servidor') =>
  Object.assign(new Error(message), { data: { code } })

const window = {
  opensAt: '2026-09-12T16:00:00.000Z',
  closesAt: '2026-09-13T01:00:00.000Z'
}
const at = (iso: string) => new Date(iso).getTime()

describe('getWindowStatus', () => {
  test('limites inclusivos, como no servidor', () => {
    expect(getWindowStatus(window, at(window.opensAt))).toBe('open')
    expect(getWindowStatus(window, at(window.closesAt))).toBe('open')
    expect(getWindowStatus(window, at(window.opensAt) - 1)).toBe('not_open')
    expect(getWindowStatus(window, at(window.closesAt) + 1)).toBe('closed')
  })
})

describe('getWindowMessage', () => {
  test('código que ainda não abriu diz de quando até quando vale', () => {
    const { title, detail } = getWindowMessage(window, 'not_open')
    expect(title).toBe('Este código ainda não abriu')
    expect(detail).toMatch(/^Ele vale de .+\d{2}:\d{2} até .+\d{2}:\d{2}\.$/)
  })

  test('código expirado diz até quando valia', () => {
    const { title, detail } = getWindowMessage(window, 'closed')
    expect(title).toBe('Este código expirou')
    expect(detail).toMatch(/^Ele valia até .+\d{2}:\d{2}\.$/)
  })
})

describe('getArrivalBlocker', () => {
  const during = at('2026-09-12T20:00:00.000Z')
  const blocker = (
    reservationStatus: 'pending' | 'confirmed' | 'declined' | 'cancelled',
    now = during
  ) => getArrivalBlocker({ reservationStatus, window }, now)

  test('reserva confirmada dentro da janela registra', () => {
    expect(blocker('confirmed')).toBeNull()
  })

  test('cada estado não confirmado tem a própria explicação', () => {
    expect(blocker('pending')?.title).toBe(
      'Esta reserva ainda não foi confirmada'
    )
    expect(blocker('declined')?.title).toBe('Esta reserva foi recusada')
    expect(blocker('cancelled')?.title).toBe('Esta reserva foi cancelada')
  })

  test('reserva confirmada fora da janela explica a janela', () => {
    expect(blocker('confirmed', at(window.opensAt) - 1)?.title).toBe(
      'Este código ainda não abriu'
    )
    expect(blocker('confirmed', at(window.closesAt) + 1)?.title).toBe(
      'Este código expirou'
    )
  })

  test('o estado da reserva vem antes da janela', () => {
    expect(blocker('pending', at(window.closesAt) + 1)?.title).toBe(
      'Esta reserva ainda não foi confirmada'
    )
  })
})

describe('getGameTitle', () => {
  const game = {
    championship: 'Brasileirão',
    participants: ['Corinthians', 'Palmeiras'],
    participantFreeText: 'Final do amador',
    startsAt: '2026-09-12T19:00:00.000Z'
  }

  test('times cadastrados vêm antes do texto livre e do campeonato', () => {
    expect(getGameTitle(game)).toBe('Corinthians × Palmeiras')
    expect(getGameTitle({ ...game, participants: [] })).toBe('Final do amador')
    expect(
      getGameTitle({ ...game, participants: [], participantFreeText: null })
    ).toBe('Brasileirão')
  })
})

describe('contador', () => {
  test('concorda em número', () => {
    expect(getCounterLabel(0, 1)).toBe('0 de 1 validado')
    expect(getCounterLabel(2, 4)).toBe('2 de 4 validados')
  })

  test('reserva completa', () => {
    expect(getAllValidatedMessage(1)).toBe(
      'A única pessoa desta reserva já foi validada.'
    )
    expect(getAllValidatedMessage(4)).toBe(
      'As 4 pessoas desta reserva já foram validadas.'
    )
  })
})

describe('mensagens de recusa', () => {
  const reservation = { maxUses: 4, window }
  const during = at('2026-09-12T20:00:00.000Z')

  test('nunca repetem o texto do servidor', () => {
    const codes = [
      'NOT_FOUND',
      'FORBIDDEN',
      'CONFLICT',
      'PRECONDITION_FAILED',
      'UNPROCESSABLE_CONTENT',
      'TOO_MANY_REQUESTS',
      'INTERNAL_SERVER_ERROR'
    ]
    for (const code of codes) {
      const error = trpcError(code)
      for (const message of [
        getLookupErrorMessage(error),
        getArrivalErrorMessage(error, reservation, during),
        getUndoErrorMessage(error)
      ]) {
        expect(message).not.toContain('texto do servidor')
        expect(message.length).toBeGreaterThan(0)
      }
    }
  })

  test('busca: código desconhecido e limite de tentativas', () => {
    expect(getLookupErrorMessage(trpcError('NOT_FOUND'))).toBe(
      'Código não encontrado. Confira com o torcedor e tente de novo.'
    )
    expect(getLookupErrorMessage(trpcError('TOO_MANY_REQUESTS'))).toBe(
      'Muitas tentativas seguidas. Aguarde um pouco e tente novamente.'
    )
  })

  test('chegada além da reserva diz quantas pessoas já entraram', () => {
    expect(
      getArrivalErrorMessage(trpcError('CONFLICT'), reservation, during)
    ).toBe('As 4 pessoas desta reserva já foram validadas.')
  })

  test('chegada fora da janela diz quando o código vale', () => {
    const before = getArrivalErrorMessage(
      trpcError('PRECONDITION_FAILED'),
      reservation,
      at(window.opensAt) - 60_000
    )
    expect(before).toMatch(/^Este código ainda não abriu\. Ele vale de /)

    const after = getArrivalErrorMessage(
      trpcError('PRECONDITION_FAILED'),
      reservation,
      at(window.closesAt) + 60_000
    )
    expect(after).toMatch(/^Este código expirou\. Ele valia até /)
  })

  test('relógio do balcão adiantado não contradiz a recusa do servidor', () => {
    expect(
      getArrivalErrorMessage(
        trpcError('PRECONDITION_FAILED'),
        reservation,
        during
      )
    ).toMatch(/^Este código expirou\./)
  })

  test('desfazer fora do prazo', () => {
    expect(getUndoErrorMessage(trpcError('PRECONDITION_FAILED'))).toBe(
      'O prazo para desfazer esta chegada acabou.'
    )
  })
})

describe('wasAnsweredByServer', () => {
  test('recusa com código é resposta; falha de rede não', () => {
    expect(wasAnsweredByServer(trpcError('CONFLICT'))).toBe(true)
    expect(wasAnsweredByServer(new TypeError('Failed to fetch'))).toBe(false)
    expect(wasAnsweredByServer(undefined)).toBe(false)
  })
})
