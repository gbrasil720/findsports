import { describe, expect, it } from 'bun:test'
import { closedNote } from './bar-states'

const closed = (opens: string, inDays = 0) =>
  ({ open: false, opens, inDays, day: 0 }) as const

describe('closedNote', () => {
  it('abre antes do jogo', () => {
    expect(closedNote(closed('17:00'), '19:00')).toBe(
      'O bar abre às 17:00, duas horas antes do jogo.'
    )
    expect(closedNote(closed('18:30'), '19:00')).toBe(
      'O bar abre às 18:30, 30 min antes do jogo.'
    )
    expect(closedNote(closed('17:30'), '19:00')).toBe(
      'O bar abre às 17:30, 1 h 30 min antes do jogo.'
    )
  })
  it('abre depois do início', () => {
    expect(closedNote(closed('20:00'), '19:00')).toBe(
      'O bar abre depois do início do jogo, às 20:00.'
    )
  })
  it('aberto, sem horário ou abrindo outro dia: nada', () => {
    expect(closedNote({ open: true, closes: '02:00' }, '19:00')).toBeNull()
    expect(closedNote(null, '19:00')).toBeNull()
    expect(closedNote(closed('17:00', 1), '19:00')).toBeNull()
  })
})
