import { describe, expect, it } from 'bun:test'
import {
  brasiliaDay,
  brasiliaDayStart,
  DEFAULT_EVENT_DURATION_MS,
  EVENT_START_MAX_AHEAD_DAYS,
  getEventEnd,
  getEventStartProblem,
  getValidationWindow,
  hasEventEnded,
  isEventLive,
  isWithinValidationWindow,
  VALIDATION_WINDOW_MARGIN_MS
} from './event-window'

const HOUR = 60 * 60 * 1000
const START = new Date('2026-09-20T19:00:00.000Z')

describe('getEventEnd', () => {
  it('sem endsAt, soma a duração padrão ao início', () => {
    expect(getEventEnd({ startsAt: START, endsAt: null })).toEqual(
      new Date(START.getTime() + DEFAULT_EVENT_DURATION_MS)
    )
  })

  it('com endsAt, usa o fim informado mesmo que seja menor que o padrão', () => {
    const endsAt = new Date(START.getTime() + HOUR)
    expect(getEventEnd({ startsAt: START, endsAt })).toEqual(endsAt)
  })

  it('aceita as datas como string, como chegam de SQL cru', () => {
    expect(
      getEventEnd({ startsAt: START.toISOString(), endsAt: null })
    ).toEqual(new Date(START.getTime() + DEFAULT_EVENT_DURATION_MS))
  })
})

describe('getValidationWindow', () => {
  it('sem endsAt: abre margem antes do início e fecha margem depois do fim derivado', () => {
    expect(getValidationWindow({ startsAt: START, endsAt: null })).toEqual({
      opensAt: new Date(START.getTime() - VALIDATION_WINDOW_MARGIN_MS),
      closesAt: new Date(
        START.getTime() +
          DEFAULT_EVENT_DURATION_MS +
          VALIDATION_WINDOW_MARGIN_MS
      )
    })
  })

  it('com endsAt: fecha margem depois do fim informado', () => {
    const endsAt = new Date(START.getTime() + 5 * HOUR)
    expect(getValidationWindow({ startsAt: START, endsAt })).toEqual({
      opensAt: new Date(START.getTime() - VALIDATION_WINDOW_MARGIN_MS),
      closesAt: new Date(endsAt.getTime() + VALIDATION_WINDOW_MARGIN_MS)
    })
  })

  it('a margem é de três horas, como define o ticket', () => {
    expect(VALIDATION_WINDOW_MARGIN_MS).toBe(3 * HOUR)
  })
})

describe('isWithinValidationWindow', () => {
  const semFim = { startsAt: START, endsAt: null }
  const { opensAt, closesAt } = getValidationWindow(semFim)

  it('limites são inclusivos', () => {
    expect(isWithinValidationWindow(semFim, opensAt)).toBe(true)
    expect(isWithinValidationWindow(semFim, closesAt)).toBe(true)
  })

  it('fora dos limites, recusa', () => {
    expect(
      isWithinValidationWindow(semFim, new Date(opensAt.getTime() - 1))
    ).toBe(false)
    expect(
      isWithinValidationWindow(semFim, new Date(closesAt.getTime() + 1))
    ).toBe(false)
  })

  it('com endsAt preenchido, a janela acompanha o fim informado', () => {
    const endsAt = new Date(START.getTime() + HOUR)
    const curto = { startsAt: START, endsAt }
    const depoisDoFimInformado = new Date(
      endsAt.getTime() + VALIDATION_WINDOW_MARGIN_MS + 1
    )
    expect(isWithinValidationWindow(curto, depoisDoFimInformado)).toBe(false)
    // O mesmo instante ainda está aberto para o jogo sem fim informado.
    expect(isWithinValidationWindow(semFim, depoisDoFimInformado)).toBe(true)
  })
})

describe('getEventStartProblem', () => {
  const NOW = START
  const DAY = 24 * HOUR

  it('aceita jogo futuro e jogo que começou e ainda está no ar', () => {
    expect(getEventStartProblem(new Date(NOW.getTime() + HOUR), NOW)).toBeNull()
    expect(getEventStartProblem(new Date(NOW.getTime() - HOUR), NOW)).toBeNull()
  })

  it('recusa jogo que já teria acabado', () => {
    expect(
      getEventStartProblem(
        new Date(NOW.getTime() - DEFAULT_EVENT_DURATION_MS),
        NOW
      )
    ).toBe('ended')
    expect(getEventStartProblem(new Date('2019-09-20T19:00:00Z'), NOW)).toBe(
      'ended'
    )
  })

  it('recusa jogo além do limite à frente', () => {
    const limit = NOW.getTime() + EVENT_START_MAX_AHEAD_DAYS * DAY
    expect(getEventStartProblem(new Date(limit), NOW)).toBeNull()
    expect(getEventStartProblem(new Date(limit + 1), NOW)).toBe('too_far')
  })
})

describe('brasiliaDay', () => {
  it('vira à meia-noite de Brasília, não à do UTC', () => {
    expect(brasiliaDay(new Date('2026-09-07T02:59:59.999Z'))).toBe('2026-09-06')
    expect(brasiliaDay(new Date('2026-09-07T03:00:00.000Z'))).toBe('2026-09-07')
  })

  it('o jogo das 21h às 23h59 de Brasília é do dia de Brasília', () => {
    // 21:00 em Brasília já é o dia seguinte no UTC.
    expect(brasiliaDay('2026-10-25T00:00:00Z')).toBe('2026-10-24')
    expect(brasiliaDay('2026-10-25T02:59:00Z')).toBe('2026-10-24')
  })

  it('soma dias de calendário, inclusive na virada de mês e de ano', () => {
    const at = new Date('2026-12-31T23:00:00Z') // 20:00 de 31/12
    expect(brasiliaDay(at, 1)).toBe('2027-01-01')
    expect(brasiliaDay(at, -31)).toBe('2026-11-30')
  })

  it('usa o histórico do fuso: no horário de verão, -02:00', () => {
    // 15/12/2018 01:30 UTC = 23:30 de 14/12 em -02:00 (seria 22:30 em -03:00).
    expect(brasiliaDay('2018-12-15T01:30:00Z')).toBe('2018-12-14')
    expect(brasiliaDay('2018-12-15T02:00:00Z')).toBe('2018-12-15')
  })
})

describe('brasiliaDayStart', () => {
  it('meia-noite de Brasília é 03:00 UTC desde 2019', () => {
    expect(brasiliaDayStart('2026-10-24').toISOString()).toBe(
      '2026-10-24T03:00:00.000Z'
    )
  })

  it('no horário de verão histórico, 02:00 UTC', () => {
    expect(brasiliaDayStart('2018-12-15').toISOString()).toBe(
      '2018-12-15T02:00:00.000Z'
    )
  })

  it('no dia em que o horário de verão começava, o dia começa no pulo', () => {
    // 04/11/2018: 00:00 virou 01:00, que é 03:00 UTC (o Postgres dá o mesmo).
    expect(brasiliaDayStart('2018-11-04').toISOString()).toBe(
      '2018-11-04T03:00:00.000Z'
    )
    expect(brasiliaDay(brasiliaDayStart('2018-11-04'))).toBe('2018-11-04')
  })

  it('no dia em que o horário de verão acabava, meia-noite em -03:00', () => {
    expect(brasiliaDayStart('2019-02-17').toISOString()).toBe(
      '2019-02-17T03:00:00.000Z'
    )
  })
})

describe('isEventLive e hasEventEnded', () => {
  const game = { startsAt: START, endsAt: null }
  const end = START.getTime() + DEFAULT_EVENT_DURATION_MS

  it('ao vivo do início (inclusivo) ao fim (exclusivo)', () => {
    expect(isEventLive(game, START.getTime() - 1)).toBe(false)
    expect(isEventLive(game, START)).toBe(true)
    expect(isEventLive(game, end - 1)).toBe(true)
    expect(isEventLive(game, end)).toBe(false)
  })

  it('acabou no instante do fim derivado', () => {
    expect(hasEventEnded(game, end - 1)).toBe(false)
    expect(hasEventEnded(game, end)).toBe(true)
  })

  it('o fim informado ganha do padrão', () => {
    const short = { startsAt: START, endsAt: new Date(START.getTime() + HOUR) }
    expect(hasEventEnded(short, START.getTime() + HOUR)).toBe(true)
    expect(isEventLive(short, START.getTime() + HOUR)).toBe(false)
  })
})
