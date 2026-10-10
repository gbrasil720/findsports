import { describe, expect, test } from 'bun:test'

import { getLapsedPaidPlan } from '@/lib/lapsed-plan'
import type { PolicyState } from './admin-model'
import { getCreateBlockReason, getDeleteErrorMessage } from './events-manager'

test('recusa do servidor na exclusão vira texto da tela', () => {
  expect(getDeleteErrorMessage({ data: { code: 'PRECONDITION_FAILED' } })).toBe(
    'Este jogo recebeu reserva ou avaliação e não pode mais ser excluído.'
  )
  expect(getDeleteErrorMessage(new Error('boom'))).toBe(
    'Não foi possível excluir o jogo. Tente novamente.'
  )
})

const PERIOD = {
  periodStart: '2026-08-01T00:00:00.000Z',
  periodEnd: '2026-09-01T00:00:00.000Z'
}

function reason(state: PolicyState): string | null {
  return getCreateBlockReason(state)
}

describe('event create availability', () => {
  test('blocks while loading and exposes retry on error state', () => {
    expect(reason({ status: 'loading' })).toBe('Verificando disponibilidade…')
    expect(reason({ status: 'error', retry: () => {}, retryable: true })).toBe(
      'Não foi possível verificar a disponibilidade.'
    )
  })

  test('blocks inactive bars and Starter at the limit', () => {
    expect(
      reason({
        status: 'ready',
        policy: {
          status: 'inactive',
          canCreate: false,
          plan: 'starter'
        }
      })
    ).toBe('Ative um plano para adicionar eventos.')
    expect(
      reason({
        status: 'ready',
        policy: {
          status: 'limited',
          canCreate: false,
          plan: 'starter',
          limit: 5,
          used: 5,
          remaining: 0,
          ...PERIOD
        }
      })
    ).toBe('Limite do plano atingido.')
  })

  test('allows available Starter, Pro and Elite policies', () => {
    expect(
      reason({
        status: 'ready',
        policy: {
          status: 'limited',
          canCreate: true,
          plan: 'starter',
          limit: 5,
          used: 4,
          remaining: 1,
          ...PERIOD
        }
      })
    ).toBeNull()
    for (const plan of ['pro', 'elite'] as const) {
      expect(
        reason({
          status: 'ready',
          policy: { status: 'unlimited', canCreate: true, plan }
        })
      ).toBeNull()
    }
  })

  // WEB-331: Pro ou Elite parado cai no limite do Starter (WEB-129), mas o
  // texto fala do plano que ele contratou, não de upgrade.
  test('plano parado no limite lê por que parou; Starter segue igual', () => {
    const atLimit: PolicyState = {
      status: 'ready',
      policy: {
        status: 'limited',
        canCreate: false,
        plan: 'starter',
        limit: 5,
        used: 5,
        remaining: 0,
        ...PERIOD
      }
    }
    const lapsed = (
      plan: 'starter' | 'pro' | 'elite',
      standing: 'current' | 'past_due' | 'trial_ended' | 'ended'
    ) => getLapsedPaidPlan({ plan, standing })?.title

    expect(getCreateBlockReason(atLimit, lapsed('elite', 'past_due'))).toBe(
      'Plano Elite com pagamento pendente: limite de jogos atingido.'
    )
    expect(getCreateBlockReason(atLimit, lapsed('pro', 'trial_ended'))).toBe(
      'Trial do plano Pro encerrado: limite de jogos atingido.'
    )
    // Starter parado continua no próprio limite; assinatura encerrada
    // contrata de novo. Nenhum dos dois é caso de regularizar.
    for (const title of [
      lapsed('starter', 'past_due'),
      lapsed('elite', 'ended'),
      lapsed('elite', 'current'),
      getLapsedPaidPlan(null)?.title
    ]) {
      expect(title).toBeUndefined()
      expect(getCreateBlockReason(atLimit, title)).toBe(
        'Limite do plano atingido.'
      )
    }
  })
})
