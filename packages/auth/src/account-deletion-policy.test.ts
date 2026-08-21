import { describe, expect, test } from 'bun:test'
import { getBarAccountDeletionBlock } from './account-deletion-policy'

const now = new Date('2026-08-21T12:00:00.000Z')

describe('bar account deletion policy', () => {
  test('allows accounts without an external subscription', () => {
    expect(
      getBarAccountDeletionBlock(
        {
          dodoSubscriptionId: null,
          status: 'active',
          currentPeriodEnd: null
        },
        now
      )
    ).toBeNull()
  })

  test.each([
    'active',
    'trialing',
    'past_due'
  ] as const)('blocks an external %s subscription', (status) => {
    expect(
      getBarAccountDeletionBlock(
        {
          dodoSubscriptionId: 'sub_123',
          status,
          currentPeriodEnd: null
        },
        now
      )
    ).toBe('subscription-active')
  })

  test('blocks cancellation until its paid period really ends', () => {
    expect(
      getBarAccountDeletionBlock(
        {
          dodoSubscriptionId: 'sub_123',
          status: 'cancelled',
          currentPeriodEnd: new Date('2026-08-22T12:00:00.000Z')
        },
        now
      )
    ).toBe('period-active')
  })

  test.each([
    ['cancelled', new Date('2026-08-21T12:00:00.000Z')],
    ['cancelled', null],
    ['inactive', new Date('2026-08-22T12:00:00.000Z')],
    ['inactive', null]
  ] as const)('allows an effectively ended %s subscription', (status, end) => {
    expect(
      getBarAccountDeletionBlock(
        {
          dodoSubscriptionId: 'sub_123',
          status,
          currentPeriodEnd: end
        },
        now
      )
    ).toBeNull()
  })
})
