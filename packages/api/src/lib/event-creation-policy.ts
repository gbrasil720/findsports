import type { db } from '@findsports_oficial/db'
import { event } from '@findsports_oficial/db/schema/platform'
import { and, count, eq, gte } from 'drizzle-orm'
import { STARTER_EVENT_LIMIT } from './plan-limits'

const FALLBACK_PERIOD_MS = 30 * 24 * 60 * 60 * 1000

export type SubscriptionPlan = 'starter' | 'pro' | 'elite'

export type EventCreationPolicy =
  | {
      status: 'inactive'
      canCreate: false
      plan: SubscriptionPlan
    }
  | {
      status: 'limited'
      canCreate: boolean
      plan: 'starter'
      limit: number
      used: number
      remaining: number
      periodStart: string
      periodEnd: string | null
    }
  | {
      status: 'unlimited'
      canCreate: true
      plan: 'pro' | 'elite'
    }

type PolicyTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0]
export type EventPolicyExecutor = typeof db | PolicyTransaction

export interface EventPolicyBar {
  id: string
  isActive: boolean
  subscription: {
    plan: SubscriptionPlan
    currentPeriodEnd: Date | null
  } | null
}

export interface EventCreationPeriod {
  start: Date
  end: Date | null
}

/** Subtracts one UTC calendar month while clamping invalid month-end dates. */
export function subtractUtcMonthClamped(value: Date): Date {
  const sourceYear = value.getUTCFullYear()
  const sourceMonth = value.getUTCMonth()
  const targetMonthIndex = sourceMonth - 1
  const targetYear = targetMonthIndex < 0 ? sourceYear - 1 : sourceYear
  const targetMonth = (targetMonthIndex + 12) % 12
  const lastTargetDay = new Date(
    Date.UTC(targetYear, targetMonth + 1, 0)
  ).getUTCDate()

  return new Date(
    Date.UTC(
      targetYear,
      targetMonth,
      Math.min(value.getUTCDate(), lastTargetDay),
      value.getUTCHours(),
      value.getUTCMinutes(),
      value.getUTCSeconds(),
      value.getUTCMilliseconds()
    )
  )
}

export function getEventCreationPeriod(
  currentPeriodEnd: Date | null,
  now: Date
): EventCreationPeriod {
  if (currentPeriodEnd) {
    return {
      start: subtractUtcMonthClamped(currentPeriodEnd),
      end: currentPeriodEnd
    }
  }

  return {
    start: new Date(now.getTime() - FALLBACK_PERIOD_MS),
    end: null
  }
}

export function buildEventCreationPolicy({
  bar,
  used,
  now
}: {
  bar: EventPolicyBar
  used: number
  now: Date
}): EventCreationPolicy {
  const plan = bar.subscription?.plan ?? 'starter'

  if (!bar.isActive) {
    return { status: 'inactive', canCreate: false, plan }
  }

  if (plan === 'pro' || plan === 'elite') {
    return { status: 'unlimited', canCreate: true, plan }
  }

  const period = getEventCreationPeriod(
    bar.subscription?.currentPeriodEnd ?? null,
    now
  )
  const remaining = Math.max(STARTER_EVENT_LIMIT - used, 0)

  return {
    status: 'limited',
    canCreate: remaining > 0,
    plan: 'starter',
    limit: STARTER_EVENT_LIMIT,
    used,
    remaining,
    periodStart: period.start.toISOString(),
    periodEnd: period.end?.toISOString() ?? null
  }
}

export async function getEventCreationPolicy(
  executor: EventPolicyExecutor,
  barSnapshot: EventPolicyBar,
  now = new Date()
): Promise<EventCreationPolicy> {
  const plan = barSnapshot.subscription?.plan ?? 'starter'
  if (!barSnapshot.isActive || plan === 'pro' || plan === 'elite') {
    return buildEventCreationPolicy({ bar: barSnapshot, used: 0, now })
  }

  const period = getEventCreationPeriod(
    barSnapshot.subscription?.currentPeriodEnd ?? null,
    now
  )
  const [result] = await executor
    .select({ value: count() })
    .from(event)
    .where(
      and(eq(event.barId, barSnapshot.id), gte(event.createdAt, period.start))
    )

  return buildEventCreationPolicy({
    bar: barSnapshot,
    used: result?.value ?? 0,
    now
  })
}
