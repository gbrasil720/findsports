type SubscriptionForDeletion = {
  dodoSubscriptionId: string | null
  status: 'trialing' | 'active' | 'inactive' | 'past_due' | 'cancelled'
  currentPeriodEnd: Date | null
}

export type BarAccountDeletionBlock = 'subscription-active' | 'period-active'

export function getBarAccountDeletionBlock(
  subscription: SubscriptionForDeletion | null,
  now = new Date()
): BarAccountDeletionBlock | null {
  if (!subscription?.dodoSubscriptionId) return null
  if (
    subscription.status === 'active' ||
    subscription.status === 'trialing' ||
    subscription.status === 'past_due'
  ) {
    return 'subscription-active'
  }
  if (
    subscription.status === 'cancelled' &&
    subscription.currentPeriodEnd &&
    subscription.currentPeriodEnd > now
  ) {
    return 'period-active'
  }
  return null
}
