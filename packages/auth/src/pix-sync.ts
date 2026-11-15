import type { SubscriptionPlan } from '@findsports_oficial/db'
import { db, eq } from '@findsports_oficial/db'
import { bar, subscription } from '@findsports_oficial/db/schema/platform'
import {
  type AbacateSubscription,
  cancelSubscriptionIfActive,
  getSubscription
} from './abacatepay'
import { ANNUAL_MONTHS } from './stripe-plan'
import { logBillingError } from './stripe-sync'

/** Desconto do produto de fundador, igual ao cupom do Stripe. */
export const PIX_FOUNDER_DISCOUNT_REAIS = 28

const PLANS: SubscriptionPlan[] = ['starter', 'pro', 'elite']

/**
 * O `externalId` do checkout leva tudo o que o webhook precisa para achar o
 * bar sem consultar mais nada: `onside:<barId>:<plano>:<f|t>:<nonce>`, `f`
 * para o produto de fundador e `t` para a tabela, e `:y` no fim para o anual
 * (sem ele, mensal: os checkouts de antes do anual seguem valendo).
 */
export function pixExternalId(
  barId: string,
  plan: SubscriptionPlan,
  founder: boolean,
  annual = false
): string {
  return `onside:${barId}:${plan}:${founder ? 'f' : 't'}:${crypto.randomUUID().slice(0, 8)}${annual ? ':y' : ''}`
}

export function parsePixExternalId(externalId: string | null | undefined): {
  barId: string
  plan: SubscriptionPlan
  founder: boolean
  annual: boolean
} | null {
  const parts = externalId?.split(':')
  if (!parts || parts[0] !== 'onside') return null
  if (parts.length !== 5 && !(parts.length === 6 && parts[5] === 'y')) {
    return null
  }
  const [, barId, plan, kind] = parts
  if (!barId || !PLANS.includes(plan as SubscriptionPlan)) return null
  if (kind !== 'f' && kind !== 't') return null
  return {
    barId,
    plan: plan as SubscriptionPlan,
    founder: kind === 'f',
    annual: parts.length === 6
  }
}

/**
 * Desconto de fundador da fatura, como o Stripe grava no anual (WEB-442): no
 * mensal R$ 28, no anual `ANNUAL_MONTHS` vezes isso, a fatura do ano.
 */
export function pixFounderDiscountReais(annual: boolean): number {
  return PIX_FOUNDER_DISCOUNT_REAIS * (annual ? ANNUAL_MONTHS : 1)
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

type Row = typeof subscription.$inferSelect

/**
 * Situação de uma assinatura ativa sem confiar na ordem dos avisos (a
 * AbacatePay não garante ordem). O que avança é o fim do ciclo pago: débito
 * que passou o empurra para a frente, débito recusado não.
 *
 * - Recusa com o ciclo já à frente do que temos gravado: um débito mais novo
 *   passou, e a recusa é antiga.
 * - Pagamento sem avançar o ciclo de quem está em atraso: aviso antigo, que
 *   não limpa uma recusa mais nova.
 */
export function pixStanding(input: {
  eventType: string
  periodEnd: Date | null
  existing: Pick<Row, 'status' | 'currentPeriodEnd'> | null
  isCurrent: boolean
}): 'active' | 'past_due' {
  const stored = input.isCurrent ? input.existing : null
  const advanced =
    !stored?.currentPeriodEnd ||
    (input.periodEnd !== null && input.periodEnd > stored.currentPeriodEnd)
  if (input.eventType === 'subscription.payment_failed') {
    return stored && advanced && stored.status === 'active'
      ? 'active'
      : 'past_due'
  }
  return stored?.status === 'past_due' && !advanced ? 'past_due' : 'active'
}

/**
 * O evento diz uma coisa e a leitura outra que ainda não chegou lá: pago com
 * a assinatura `PENDING`, ou cancelado com ela viva.
 */
export function readLagsBehind(eventType: string, status: string): boolean {
  if (eventType === 'subscription.cancelled') return status !== 'CANCELLED'
  if (
    eventType === 'subscription.completed' ||
    eventType === 'subscription.renewed'
  ) {
    return status === 'PENDING'
  }
  return false
}

/**
 * Grava o estado ATUAL de uma assinatura Pix, como `applyStripeSubscription`:
 * relê a assinatura na AbacatePay em vez de confiar no corpo do evento.
 *
 * | AbacatePay                        | Nosso                              |
 * | --------------------------------- | ---------------------------------- |
 * | `ACTIVE`                          | `active` (`past_due` pela          |
 * |                                   | `pixStanding`, segue no ar)        |
 * | `CANCELLED` com ciclo pago à      | `active` até `cancel_at` (o cron   |
 * | frente (painel, app do banco)     | encerra; ver `reconcileBarPlans`)  |
 * | `CANCELLED` com o ciclo vencido   | `cancelled`, o bar sai do ar       |
 * | `PENDING`                         | nada: o Pix ainda não foi pago     |
 *
 * Assinatura nova ativa com outra Pix na linha (troca de plano, que no Pix é
 * uma autorização nova) cancela a antiga ANTES de gravar a nova: se o
 * cancelamento falhar, o aviso responde 500, a AbacatePay reenvia e a linha
 * ainda tem o id da antiga para tentar de novo. Aviso atrasado de uma
 * assinatura mais velha que a da linha não a substitui: a velha é cancelada.
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
  if (readLagsBehind(eventType, sub.status)) {
    // A leitura da AbacatePay demora a refletir a escrita (visto ~1 min no
    // Modo Teste). Ignorar o aviso perderia o pagamento ou o cancelamento:
    // o erro vira 500, e a AbacatePay reenvia quando a leitura já alcançou.
    throw new Error(
      `Leitura atrasada da AbacatePay: ${eventType} com a assinatura em ${sub.status}.`
    )
  }
  if (sub.status === 'PENDING') return null

  const foundBar = await db.query.bar.findFirst({
    where: eq(bar.id, ref.barId),
    columns: { id: true }
  })
  if (!foundBar) {
    logBillingError('pix_webhook_bar_not_found', { subscriptionId, ...ref })
    return null
  }
  const existing =
    (await db.query.subscription.findFirst({
      where: eq(subscription.barId, ref.barId)
    })) ?? null
  const isCurrent = existing?.externalSubscriptionId === sub.id
  const periodEnd = periodEndOf(sub)

  if (sub.status === 'CANCELLED') {
    // Aviso de uma assinatura que não é mais a do bar (a antiga da troca de
    // plano, ou uma do Stripe que entrou depois): não derruba nada.
    if (!isCurrent || !existing) return null
    // Cancelada no painel, no app do banco ou na AbacatePay: o ciclo pago
    // vale até o fim, e o cron encerra depois.
    const end = existing.cancelAt ?? periodEnd
    if (end && end > new Date()) {
      if (!existing.cancelAt) {
        await db
          .update(subscription)
          .set({ cancelAt: end })
          .where(eq(subscription.barId, ref.barId))
      }
      return ref.barId
    }
    await db
      .update(subscription)
      .set({ status: 'cancelled', cancelAt: null })
      .where(eq(subscription.barId, ref.barId))
    await db.update(bar).set({ isActive: false }).where(eq(bar.id, ref.barId))
    return ref.barId
  }

  const previous =
    existing?.provider === 'abacatepay' &&
    existing.externalSubscriptionId &&
    !isCurrent
      ? existing.externalSubscriptionId
      : null

  if (previous && existing?.status !== 'cancelled') {
    // Sem resposta, segue: o cancelamento da antiga logo abaixo tenta de novo
    // e, falhando, faz o aviso voltar com 500.
    const current = await getSubscription(previous).catch(() => null)
    if (
      current &&
      current.status !== 'CANCELLED' &&
      new Date(current.createdAt) > new Date(sub.createdAt)
    ) {
      // A linha já tem uma autorização mais nova: este aviso é de uma velha
      // que ficou ativa. Ela é que sai.
      await cancelSubscriptionIfActive(sub.id)
      logBillingError('pix_stale_subscription_cancelled', {
        barId: ref.barId,
        subscriptionId: sub.id,
        current: previous
      })
      return null
    }
  }
  if (previous) await cancelSubscriptionIfActive(previous)

  const values = {
    status: pixStanding({ eventType, periodEnd, existing, isCurrent }),
    plan: ref.plan,
    provider: 'abacatepay' as const,
    externalSubscriptionId: sub.id,
    currentPeriodEnd: periodEnd,
    // Débito de agora em diante: uma assinatura nova nunca nasce cancelada.
    cancelAt: isCurrent ? (existing?.cancelAt ?? null) : null,
    monthlyDiscountReais: ref.founder ? pixFounderDiscountReais(ref.annual) : 0,
    billingInterval: ref.annual ? ('year' as const) : ('month' as const),
    // O Pix escolhido no teste foi autorizado: não há mais o que lembrar.
    pixAfterTrialAt: null,
    // Pago: não há checkout pendente a apagar no próximo.
    pixCheckoutId: null
  }
  await db
    .insert(subscription)
    .values({ barId: ref.barId, ...values })
    .onConflictDoUpdate({ target: subscription.barId, set: values })
  await db.update(bar).set({ isActive: true }).where(eq(bar.id, ref.barId))
  return ref.barId
}
