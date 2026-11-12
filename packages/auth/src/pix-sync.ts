import type { SubscriptionPlan } from '@findsports_oficial/db'
import { db, eq } from '@findsports_oficial/db'
import { bar, subscription } from '@findsports_oficial/db/schema/platform'
import {
  type AbacateSubscription,
  cancelSubscription,
  getSubscription
} from './abacatepay'
import { logBillingError } from './stripe-sync'

/** Desconto do produto de fundador, igual ao cupom do Stripe. */
export const PIX_FOUNDER_DISCOUNT_REAIS = 28

const PLANS: SubscriptionPlan[] = ['starter', 'pro', 'elite']

/**
 * O `externalId` do checkout leva tudo o que o webhook precisa para achar o
 * bar sem consultar mais nada: `onside:<barId>:<plano>:<f|t>:<nonce>`, `f`
 * para o produto de fundador e `t` para a tabela.
 */
export function pixExternalId(
  barId: string,
  plan: SubscriptionPlan,
  founder: boolean
): string {
  return `onside:${barId}:${plan}:${founder ? 'f' : 't'}:${crypto.randomUUID().slice(0, 8)}`
}

export function parsePixExternalId(
  externalId: string | null | undefined
): { barId: string; plan: SubscriptionPlan; founder: boolean } | null {
  const parts = externalId?.split(':')
  if (!parts || parts.length !== 5 || parts[0] !== 'onside') return null
  const [, barId, plan, kind] = parts
  if (!barId || !PLANS.includes(plan as SubscriptionPlan)) return null
  if (kind !== 'f' && kind !== 't') return null
  return { barId, plan: plan as SubscriptionPlan, founder: kind === 'f' }
}

/** A API manda o fim do ciclo como data (`2026-12-11`): vale o dia inteiro. */
function periodEndOf(sub: AbacateSubscription): Date | null {
  const end = sub.currentPeriodEnd
  if (!end) return null
  return new Date(end.length === 10 ? `${end}T23:59:59Z` : end)
}

export type PixEvent =
  | 'subscription.completed'
  | 'subscription.renewed'
  | 'subscription.payment_failed'
  | 'subscription.cancelled'

/**
 * Grava o estado ATUAL de uma assinatura Pix, como `applyStripeSubscription`:
 * relê a assinatura na AbacatePay em vez de confiar no corpo do evento, então
 * evento repetido ou fora de ordem grava o mesmo estado.
 *
 * | AbacatePay                        | Nosso                              |
 * | --------------------------------- | ---------------------------------- |
 * | `ACTIVE`                          | `active`                           |
 * | `ACTIVE` + `payment_failed`       | `past_due` (segue no ar, Starter)  |
 * | `CANCELLED` com fim já agendado   | `active` até `cancel_at` (o cron   |
 * |                                   | encerra; ver `reconcileBarPlans`)  |
 * | `CANCELLED` sem agendamento       | `cancelled`, o bar sai do ar       |
 * | `PENDING`                         | nada: o Pix ainda não foi pago     |
 *
 * Assinatura nova ativa com outra Pix na linha (troca de plano, que no Pix é
 * uma autorização nova) cancela a antiga na AbacatePay.
 */
export async function applyPixSubscription(
  subscriptionId: string,
  externalId: string | null | undefined,
  eventType: PixEvent | string
): Promise<string | null> {
  const ref = parsePixExternalId(externalId)
  if (!ref) {
    logBillingError('pix_webhook_unknown_external_id', {
      subscriptionId,
      externalId: externalId ?? null
    })
    return null
  }
  const sub = await getSubscription(subscriptionId)
  if (sub.status === 'PENDING') return null

  const foundBar = await db.query.bar.findFirst({
    where: eq(bar.id, ref.barId),
    columns: { id: true }
  })
  if (!foundBar) {
    logBillingError('pix_webhook_bar_not_found', { subscriptionId, ...ref })
    return null
  }
  const existing = await db.query.subscription.findFirst({
    where: eq(subscription.barId, ref.barId)
  })
  const isCurrent = existing?.externalSubscriptionId === sub.id

  if (sub.status === 'CANCELLED') {
    // Aviso de uma assinatura que não é mais a do bar (a antiga da troca de
    // plano, ou uma do Stripe que entrou depois): não derruba nada.
    if (!isCurrent || !existing) return null
    // Cancelada pelo painel: o mês pago vale até o fim e o cron encerra.
    if (existing.cancelAt && existing.cancelAt > new Date()) return ref.barId
    await db
      .update(subscription)
      .set({ status: 'cancelled', cancelAt: null })
      .where(eq(subscription.barId, ref.barId))
    await db.update(bar).set({ isActive: false }).where(eq(bar.id, ref.barId))
    return ref.barId
  }

  const previous =
    existing?.provider === 'abacatepay' && !isCurrent
      ? existing.externalSubscriptionId
      : null

  const values = {
    status:
      eventType === 'subscription.payment_failed'
        ? ('past_due' as const)
        : ('active' as const),
    plan: ref.plan,
    provider: 'abacatepay' as const,
    externalSubscriptionId: sub.id,
    currentPeriodEnd: periodEndOf(sub),
    // Débito de agora em diante: uma assinatura nova nunca nasce cancelada.
    cancelAt: isCurrent ? (existing?.cancelAt ?? null) : null,
    monthlyDiscountReais: ref.founder ? PIX_FOUNDER_DISCOUNT_REAIS : 0,
    // O Pix escolhido no teste foi autorizado: não há mais o que lembrar.
    pixAfterTrialAt: null
  }
  await db
    .insert(subscription)
    .values({ barId: ref.barId, ...values })
    .onConflictDoUpdate({ target: subscription.barId, set: values })
  await db.update(bar).set({ isActive: true }).where(eq(bar.id, ref.barId))

  if (previous) {
    await cancelSubscription(previous).catch((error: unknown) =>
      logBillingError('pix_previous_cancel_failed', {
        subscriptionId: previous,
        message: error instanceof Error ? error.message : String(error)
      })
    )
  }
  return ref.barId
}
