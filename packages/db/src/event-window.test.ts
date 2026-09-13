import { describe, expect, it } from 'bun:test'
import {
  DEFAULT_EVENT_DURATION_MS,
  getEventEnd,
  getValidationWindow,
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
