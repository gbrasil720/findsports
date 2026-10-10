import type { db } from '@findsports_oficial/db'
import { and, count, eq, gte } from '@findsports_oficial/db'
import { event } from '@findsports_oficial/db/schema/platform'
import { getCurrentPlan, type SubscriptionForPlan } from './current-plan'
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
  subscription: SubscriptionForPlan | null
}

export interface EventCreationPeriod {
  start: Date
  end: Date | null
}

/** Subtracts UTC calendar months while clamping invalid month-end dates. */
export function subtractUtcMonthClamped(value: Date, months = 1): Date {
  const target = value.getUTCFullYear() * 12 + value.getUTCMonth() - months
  const targetYear = Math.floor(target / 12)
  const targetMonth = target % 12
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
  // Período já encerrado (trial vencido, pagamento pendente) não é ciclo de
  // cobrança: a janela congelaria ali e a contagem nunca zeraria.
  if (currentPeriodEnd && currentPeriodEnd > now) {
    // Período maior que um mês é o teste grátis, que dura meses (WEB-358): o
    // ciclo é o mês que contém `now`, contado de trás para frente a partir do
    // fim. Sem isso a janela começava no futuro e nenhum jogo criado hoje
    // entrava na conta do Starter.
    let months = 1
    while (subtractUtcMonthClamped(currentPeriodEnd, months) > now) months++
    return {
      start: subtractUtcMonthClamped(currentPeriodEnd, months),
      end: subtractUtcMonthClamped(currentPeriodEnd, months - 1)
    }
  }

  return {
    start: new Date(now.getTime() - FALLBACK_PERIOD_MS),
    end: null
  }
}

/**
 * Plano que vale para o limite de jogos: o vigente (WEB-129). Pro ou Elite em
 * `past_due`, ou com trial vencido, cai no limite do Starter.
 */
function planForEvents(bar: EventPolicyBar, now: Date): SubscriptionPlan {
  return getCurrentPlan(bar.subscription, now) ?? 'starter'
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
  const plan = planForEvents(bar, now)

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
  const plan = planForEvents(barSnapshot, now)
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
