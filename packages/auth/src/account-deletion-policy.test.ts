import { describe, expect, test } from 'bun:test'
import { getBarAccountDeletionBlock } from './account-deletion-policy'

describe('bar account deletion policy', () => {
  test('allows accounts without an external subscription', () => {
    expect(
      getBarAccountDeletionBlock({
        externalSubscriptionId: null,
        status: 'active'
      })
    ).toBeNull()
  })

  test.each([
    'active',
    'trialing',
    'past_due'
  ] as const)('blocks an external %s subscription', (status) => {
    expect(
      getBarAccountDeletionBlock({
        externalSubscriptionId: 'sub_123',
        status
      })
    ).toBe('subscription-active')
  })

  // WEB-60: `cancelled` é assinatura que já acabou no Stripe, inclusive no
  // cancelamento imediato, que chega com o período ainda no futuro.
  test.each([
    'cancelled',
    'inactive'
  ] as const)('allows an ended %s subscription', (status) => {
    expect(
      getBarAccountDeletionBlock({
        externalSubscriptionId: 'sub_123',
        status
      })
    ).toBeNull()
  })
})
