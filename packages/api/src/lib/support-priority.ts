import type { SubscriptionPlan } from '@findsports_oficial/db'

export type SupportPriority = 'standard' | 'priority' | 'highest'

export const SUPPORT_PRIORITY_RANK: Record<SupportPriority, number> = {
  highest: 0,
  priority: 1,
  standard: 2
}

export function deriveSupportPriority(
  plan: SubscriptionPlan | null | undefined
): SupportPriority {
  switch (plan) {
    case 'elite':
      return 'highest'
    case 'pro':
      return 'priority'
    default:
      return 'standard'
  }
}
