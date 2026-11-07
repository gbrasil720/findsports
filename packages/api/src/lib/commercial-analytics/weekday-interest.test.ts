import { describe, expect, it } from 'bun:test'
import { weekdayInterest } from './weekday-interest'

// 2026-10-26 é segunda; as quatro segundas antes: 19, 12, 5/10 e 28/09.
const DIA = '2026-10-26'
const ANTIGO = '2026-01-01'

describe('interesse contra o normal do dia da semana (WEB-449)', () => {
  it('média das quatro semanas anteriores', () => {
    expect(weekdayInterest(DIA, [14, 10, 8, 12, 10], ANTIGO)).toEqual({
      day: DIA,
      interestedPeople: 14,
      normal: 10,
      changePercent: 40,
      weeks: 4
    })
  })

  it('abaixo do normal sai negativo', () => {
    expect(
      weekdayInterest(DIA, [5, 10, 10, 10, 10], ANTIGO).changePercent
    ).toBe(-50)
  })

  it('semana de antes do bar existir não entra na média', () => {
    // Criado na segunda 05/10: entram só 19 e 12/10.
    const r = weekdayInterest(DIA, [9, 6, 6, 0, 0], '2026-10-05')
    expect(r.weeks).toBe(2)
    expect(r.normal).toBe(6)
    expect(r.changePercent).toBe(50)
  })

  it('com menos de duas semanas não há normal', () => {
    expect(weekdayInterest(DIA, [9, 6, 0, 0, 0], '2026-10-12')).toEqual({
      day: DIA,
      interestedPeople: 9,
      normal: null,
      changePercent: null,
      weeks: 1
    })
  })

  it('normal zero: zero hoje é 0%, interesse hoje não tem razão', () => {
    expect(weekdayInterest(DIA, [0, 0, 0, 0, 0], ANTIGO).changePercent).toBe(0)
    expect(
      weekdayInterest(DIA, [3, 0, 0, 0, 0], ANTIGO).changePercent
    ).toBeNull()
  })
})
