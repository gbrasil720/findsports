import { describe, expect, test } from 'bun:test'
import { getLateEntryWindow, LATE_ENTRY_HOURS } from './reservation-validation'

describe('getLateEntryWindow (WEB-412)', () => {
  test('fecha 48 h depois do fim do jogo', () => {
    const startsAt = new Date('2026-10-17T22:00:00Z')
    const endsAt = new Date('2026-10-18T00:00:00Z')
    const window = getLateEntryWindow({ startsAt, endsAt })
    expect(window.closesAt.toISOString()).toBe('2026-10-20T00:00:00.000Z')
    expect(LATE_ENTRY_HOURS).toBe(48)
  })

  test('sem fim informado conta do fim padrão do jogo', () => {
    const startsAt = new Date('2026-10-17T22:00:00Z')
    const window = getLateEntryWindow({ startsAt, endsAt: null })
    // Fim padrão de 3 h: 01:00 do dia 18, mais 48 h.
    expect(window.closesAt.toISOString()).toBe('2026-10-20T01:00:00.000Z')
    expect(window.opensAt < startsAt).toBe(true)
  })
})
