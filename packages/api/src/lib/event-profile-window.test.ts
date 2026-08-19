import { describe, expect, it } from 'bun:test'
import {
  EVENT_LIVE_WINDOW_HOURS,
  EVENT_LIVE_WINDOW_MS,
  isEventVisibleOnProfile
} from './event-profile-window'

const NOW = new Date('2026-08-19T22:00:00.000Z')
const HOUR = 60 * 60 * 1000

describe('isEventVisibleOnProfile', () => {
  it('mantém jogo futuro', () => {
    const startsAt = new Date(NOW.getTime() + 2 * HOUR)
    expect(isEventVisibleOnProfile(startsAt, null, NOW)).toBe(true)
  })

  it('mantém jogo que começou há pouco e não informou fim', () => {
    const startsAt = new Date(NOW.getTime() - 5 * 60 * 1000)
    expect(isEventVisibleOnProfile(startsAt, null, NOW)).toBe(true)
  })

  it('mantém jogo exatamente na borda da janela', () => {
    const startsAt = new Date(NOW.getTime() - EVENT_LIVE_WINDOW_MS)
    expect(isEventVisibleOnProfile(startsAt, null, NOW)).toBe(true)
  })

  it('descarta jogo um milissegundo além da janela', () => {
    const startsAt = new Date(NOW.getTime() - EVENT_LIVE_WINDOW_MS - 1)
    expect(isEventVisibleOnProfile(startsAt, null, NOW)).toBe(false)
  })

  it('respeita endsAt informado em vez da janela padrão', () => {
    const startsAt = new Date(NOW.getTime() - 5 * HOUR)
    const endsAt = new Date(NOW.getTime() + 30 * 60 * 1000)
    // Começou há mais tempo que a janela, mas o bar disse que ainda rola.
    expect(isEventVisibleOnProfile(startsAt, endsAt, NOW)).toBe(true)
  })

  it('descarta jogo cujo endsAt já passou, mesmo dentro da janela padrão', () => {
    const startsAt = new Date(NOW.getTime() - 1 * HOUR)
    const endsAt = new Date(NOW.getTime() - 1 * 60 * 1000)
    expect(isEventVisibleOnProfile(startsAt, endsAt, NOW)).toBe(false)
  })

  it('mantém a janela igual à do cliente (domain/events LIVE_WINDOW_MS)', () => {
    expect(EVENT_LIVE_WINDOW_HOURS).toBe(3)
    expect(EVENT_LIVE_WINDOW_MS).toBe(3 * HOUR)
  })
})
