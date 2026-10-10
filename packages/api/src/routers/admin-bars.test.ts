import { describe, expect, it } from 'bun:test'

import type { Context } from '../context'
import { stripeSubscriptionUrl } from './admin-bars'
import { appRouter } from './index'
import { refusal } from './integration-seed'

/**
 * WEB-354: a lista de bares traz e-mail do dono e assinatura de todo mundo.
 * A recusa é do middleware, antes do banco, então roda sem infraestrutura.
 */
function contextoCom(role: 'fan' | 'pub' | null): Context {
  if (role === null) return { auth: null, session: null, clientIp: '127.0.0.1' }
  return {
    auth: null,
    clientIp: '127.0.0.1',
    session: {
      session: { id: 's', userId: 'u', token: 't' },
      user: { id: 'u', emailVerified: true, role, onboardingCompleted: true }
    }
  } as unknown as Context
}

describe('adminBars.list — autorização', () => {
  it('recusa quem não tem sessão', async () => {
    const caller = appRouter.createCaller(contextoCom(null))
    expect((await refusal(caller.adminBars.list({}))).code).toBe('UNAUTHORIZED')
  })

  for (const role of ['fan', 'pub'] as const) {
    it(`recusa conta ${role}`, async () => {
      const caller = appRouter.createCaller(contextoCom(role))
      expect((await refusal(caller.adminBars.list({}))).code).toBe('FORBIDDEN')
    })
  }
})

describe('stripeSubscriptionUrl', () => {
  it('chave de teste, restrita ou ausente aponta para o modo de teste', () => {
    for (const key of ['sk_test_x', 'rk_test_x', undefined]) {
      expect(stripeSubscriptionUrl('sub_1', key)).toBe(
        'https://dashboard.stripe.com/test/subscriptions/sub_1'
      )
    }
  })

  it('chave viva aponta para o modo vivo, e a chave não entra no link', () => {
    const url = stripeSubscriptionUrl('sub_1', 'sk_live_segredo')
    expect(url).toBe('https://dashboard.stripe.com/subscriptions/sub_1')
  })
})
