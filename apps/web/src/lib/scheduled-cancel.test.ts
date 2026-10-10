import { describe, expect, test } from 'bun:test'
import {
  canCancelSubscription,
  getCancelNotice,
  getScheduledCancelAt
} from './scheduled-cancel'

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

describe('atalho de cancelar (WEB-339)', () => {
  const live = {
    standing: 'current' as const,
    cancelAt: null,
    externalSubscriptionId: 'sub_123'
  }

  test('só para assinatura viva no Stripe e sem fim agendado', () => {
    expect(canCancelSubscription(live)).toBe(true)
    expect(canCancelSubscription(null)).toBe(false)
    // Teste grátis do cadastro: nada no Stripe a cancelar.
    expect(
      canCancelSubscription({ ...live, externalSubscriptionId: null })
    ).toBe(false)
    // Já agendado: a ação passa a ser reativar.
    expect(
      canCancelSubscription({ ...live, cancelAt: '2026-11-09T15:00:00.000Z' })
    ).toBe(false)
    for (const standing of ['ended', 'past_due', 'trial_ended'] as const) {
      expect(canCancelSubscription({ ...live, standing })).toBe(false)
    }
  })
})
