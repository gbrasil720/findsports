import { describe, expect, test } from 'bun:test'
import { liveStripeSubscriptionId } from './account-deletion-policy'

describe('assinatura a encerrar na exclusão da conta', () => {
  test('sem assinatura no Stripe não há o que encerrar', () => {
    expect(liveStripeSubscriptionId(null)).toBeNull()
    expect(
      liveStripeSubscriptionId({
        externalSubscriptionId: null,
        status: 'active'
      })
    ).toBeNull()
  })

  test.each([
    'active',
    'trialing',
    'past_due'
  ] as const)('assinatura %s no Stripe é encerrada', (status) => {
    expect(
      liveStripeSubscriptionId({
        externalSubscriptionId: 'sub_123',
        status
      })
    ).toBe('sub_123')
  })

  // WEB-60: `cancelled` é assinatura que já acabou no Stripe, inclusive no
  // cancelamento imediato, que chega com o período ainda no futuro.
  test.each([
    'cancelled',
    'inactive'
  ] as const)('assinatura %s já não cobra', (status) => {
    expect(
      liveStripeSubscriptionId({
        externalSubscriptionId: 'sub_123',
        status
      })
    ).toBeNull()
  })
})
