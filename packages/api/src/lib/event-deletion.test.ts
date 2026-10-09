import { describe, expect, test } from 'bun:test'
import {
  type EventDeletionImpact,
  getEventDeletionBlock
} from './event-deletion'

const NOTHING: EventDeletionImpact = {
  pendingReservations: 0,
  confirmedReservations: 0,
  ratings: 0,
  closedReservations: 0,
  hasAttendance: false
}

describe('getEventDeletionBlock', () => {
  test('reserva ativa ou avaliação bloqueia, com o motivo e a contagem', () => {
    expect(
      getEventDeletionBlock({
        ...NOTHING,
        pendingReservations: 1,
        confirmedReservations: 1
      })
    ).toBe('Este jogo tem 2 reservas ativas e não pode ser excluído.')
    expect(getEventDeletionBlock({ ...NOTHING, ratings: 1 })).toBe(
      'Este jogo tem 1 avaliação e não pode ser excluído.'
    )
    expect(
      getEventDeletionBlock({
        ...NOTHING,
        confirmedReservations: 1,
        ratings: 3
      })
    ).toBe(
      'Este jogo tem 1 reserva ativa e 3 avaliações e não pode ser excluído.'
    )
  })

  test('reserva encerrada e presença não bloqueiam', () => {
    expect(getEventDeletionBlock(NOTHING)).toBeNull()
    expect(
      getEventDeletionBlock({
        ...NOTHING,
        closedReservations: 4,
        hasAttendance: true
      })
    ).toBeNull()
  })
})
