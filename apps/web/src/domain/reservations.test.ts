import { describe, expect, test } from 'bun:test'
import {
  DUPLICATE_REQUEST_MESSAGE,
  type FanReservation,
  findActiveRequest,
  formatArrival,
  getCancelErrorMessage,
  getCreateErrorMessage,
  getDecisionNotice,
  getLatestDecision,
  getPresenceNote,
  getStatusDetail,
  getUnseenDecisions,
  PRESENCE_KEPT_MESSAGE,
  PRESENCE_REMOVED_MESSAGE,
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

  // WEB-259: o servidor recusa com CONFLICT quando o bar já validou alguém.
  test('chegada registrada explica por que não cancela', () => {
    expect(getCancelErrorMessage(refusal('CONFLICT'))).toBe(
      'O bar já registrou chegada nesta reserva. Ela não pode mais ser cancelada.'
    )
  })
})

describe('getStatusDetail', () => {
  test('confirmada antes do fim do jogo manda mostrar o código ao chegar', () => {
    expect(
      getStatusDetail({ status: 'confirmed', code: 'QXUNQM', arrival: null })
    ).toContain('ao chegar')
  })

  // WEB-259: a chegada que o bar registrou aparece para o torcedor.
  test('chegada registrada mostra quantos chegaram e o horário', () => {
    const lastAt = new Date(2026, 9, 8, 16, 40).toISOString()
    const partial = { count: 1, of: 2, lastAt }
    expect(formatArrival(partial)).toBe('Chegada registrada (1 de 2) às 16:40')
    expect(formatArrival({ ...partial, lastAt: null })).toBe(
      'Chegada registrada (1 de 2)'
    )
    expect(
      getStatusDetail({ status: 'confirmed', code: 'QXUNQM', arrival: partial })
    ).toBe(
      'Chegada registrada (1 de 2) às 16:40. O mesmo código vale para quem ainda vai chegar.'
    )
    expect(
      getStatusDetail({
        status: 'confirmed',
        code: 'QXUNQM',
        arrival: { count: 2, of: 2, lastAt }
      })
    ).toBe('Chegada registrada (2 de 2) às 16:40.')
  })

  // WEB-322: depois do jogo ninguém mais "chega", e a ADR 0003 não julga.
  test('jogo encerrado não manda chegar nem acusa falta', () => {
    const open = getStatusDetail({
      status: 'ended',
      code: 'QXUNQM',
      arrival: null
    })
    const closed = getStatusDetail({
      status: 'ended',
      code: null,
      arrival: null
    })
    expect(RESERVATION_STATUS_LABEL.ended).toBe('Jogo encerrado')
    expect(open).toContain('ainda vale')
    expect(closed).toContain('não vale mais')
    for (const text of [open, closed]) {
      expect(text).not.toMatch(/chegar|compareceu/)
    }
  })
})

// WEB-296: cancelar mantém a presença; a recusa desfaz a que veio da reserva.
describe('getPresenceNote', () => {
  const now = Date.parse('2026-10-08T12:00:00Z')
  const note = (status: string, attending: boolean, startsInMs = 60_000) =>
    getPresenceNote(
      {
        status: status as FanReservation['status'],
        attending,
        event: { startsAt: new Date(now + startsInMs).toISOString() }
      },
      now
    )

  test('cancelada ou recusada com presença avisa que ela continua', () => {
    expect(note('cancelled', true)).toBe('kept')
    expect(note('declined', true)).toBe('kept')
  })

  test('recusada sem presença avisa que ela saiu; cancelada sem presença não diz nada', () => {
    expect(note('declined', false)).toBe('removed')
    expect(note('cancelled', false)).toBeNull()
  })

  test('reserva viva e jogo que já começou não dizem nada', () => {
    expect(note('pending', true)).toBeNull()
    expect(note('confirmed', true)).toBeNull()
    expect(note('cancelled', true, -60_000)).toBeNull()
    expect(note('declined', false, 0)).toBeNull()
  })
})

// WEB-318: o que o torcedor ainda não viu, e o que o aviso diz.
describe('aviso de resposta do bar', () => {
  const at = (decidedAt: string | null) => ({ decidedAt })
  const first = at('2026-10-08T10:00:00Z')
  const second = at('2026-10-08T11:00:00Z')
  const firstMs = Date.parse('2026-10-08T10:00:00Z')

  test('só conta resposta mais nova que a última vista, da mais recente para a mais antiga', () => {
    const mine = [first, at(null), second]
    expect(getUnseenDecisions(mine, 0)).toEqual([second, first])
    expect(getUnseenDecisions(mine, firstMs)).toEqual([second])
    expect(getUnseenDecisions(mine, firstMs + 3_600_000)).toEqual([])
    expect(getUnseenDecisions(undefined, 0)).toEqual([])
  })

  test('ver a lista marca até a resposta mais recente', () => {
    expect(getLatestDecision([first, second, at(null)])).toBe(
      firstMs + 3_600_000
    )
    expect(getLatestDecision([])).toBe(0)
  })

  test('confirmação aponta para o código', () => {
    expect(
      getDecisionNotice({
        status: 'confirmed',
        attending: true,
        bar: { name: 'Bar do Zé' }
      })
    ).toEqual({
      title: 'Bar do Zé confirmou sua reserva.',
      description: 'O código para mostrar no bar está em Minhas reservas.'
    })
  })

  test('recusa diz o que houve com “Vou assistir aqui”', () => {
    const declined = { status: 'declined' as const, bar: { name: 'Bar do Zé' } }
    expect(getDecisionNotice({ ...declined, attending: false })).toEqual({
      title: 'Bar do Zé recusou seu pedido de reserva.',
      description: PRESENCE_REMOVED_MESSAGE
    })
    expect(
      getDecisionNotice({ ...declined, attending: true }).description
    ).toBe(PRESENCE_KEPT_MESSAGE)
  })
})
