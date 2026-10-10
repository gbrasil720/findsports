import { describe, expect, test } from 'bun:test'
import { getCancelNotice, getScheduledCancelAt } from './scheduled-cancel'

describe('cancelamento agendado (WEB-335)', () => {
  const scheduled = {
    standing: 'current' as const,
    cancelAt: '2026-11-09T15:00:00.000Z'
  }

  test('diz quando cancela e que o plano segue até lá', () => {
    expect(getCancelNotice(scheduled)).toBe(
      'Cancela em 09/11 — o plano segue até lá'
    )
    expect(getScheduledCancelAt(scheduled)).toEqual(
      new Date(scheduled.cancelAt)
    )
  })

  test('fica calado sem agendamento ou com o plano fora de vigor', () => {
    expect(getCancelNotice(null)).toBeNull()
    expect(getCancelNotice({ ...scheduled, cancelAt: null })).toBeNull()
    // Encerrada ou parada: a data ficou gravada, mas o aviso é outro.
    for (const standing of ['ended', 'past_due', 'trial_ended'] as const) {
      expect(getCancelNotice({ ...scheduled, standing })).toBeNull()
    }
  })
})
