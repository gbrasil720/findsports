import { db, eq } from '@findsports_oficial/db'
import { user } from '@findsports_oficial/db/schema/auth'
import { bar, subscription } from '@findsports_oficial/db/schema/platform'
import type Stripe from 'stripe'
import { monthlyDiscountReaisFromStripe } from './stripe-discount'
import { planForLookupKey } from './stripe-plan'

type LocalStatus = 'trialing' | 'active' | 'past_due' | 'inactive'

/**
 * Tradução da situação da assinatura no Stripe para `subscription_status`
 * (WEB-31). É a tabela inteira: situação que não está aqui não é gravada.
 *
 * | Stripe               | Nosso      | Por quê                                   |
 * | -------------------- | ---------- | ----------------------------------------- |
 * | `trialing`           | `trialing` | teste grátis, com cartão guardado         |
 * | `active`             | `active`   | paga em dia, inclusive com cancelamento   |
 * |                      |            | marcado para o fim do período             |
 * | `past_due`           | `past_due` | cobrança recusada, Stripe ainda retenta   |
 * | `unpaid`             | `past_due` | retentativas esgotadas, sem cancelar      |
 * | `canceled`           | `inactive` | acabou: o bar sai do ar                   |
 * | `paused`             | `inactive` | cobrança pausada pelo painel              |
 * | `incomplete`         | —          | primeiro pagamento ainda não concluído    |
 * | `incomplete_expired` | —          | checkout que nunca virou assinatura       |
 *
 * As duas últimas não escrevem nada: gravar `inactive` ali derrubaria o trial
 * de cadastro de um bar que só tentou pagar e não conseguiu.
 */
export function localStatusFor(
  status: Stripe.Subscription.Status
): LocalStatus | null {
  switch (status) {
    case 'trialing':
      return 'trialing'
    case 'active':
      return 'active'
    case 'past_due':
    case 'unpaid':
      return 'past_due'
    case 'canceled':
    case 'paused':
      return 'inactive'
    default:
      return null
  }
}

/**
 * Assinatura a que o evento se refere, ou `null` para evento que não mexe em
 * assinatura. São os quatro que o Stripe manda no ciclo de vida: fim do
 * checkout, criação, mudança (plano, situação, renovação) e encerramento.
 */
export function subscriptionIdOf(event: Stripe.Event): string | null {
  switch (event.type) {
    case 'checkout.session.completed': {
      const sub = event.data.object.subscription
      return typeof sub === 'string' ? sub : (sub?.id ?? null)
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      return event.data.object.id
    default:
      return null
  }
}

// Caso de cobrança que o webhook não aplica (WEB-194). Vai como uma linha
// JSON no log para dar para filtrar e reconciliar à mão.
export function logBillingError(
  event: string,
  details: Record<string, unknown>
) {
  console.error(JSON.stringify({ level: 'error', event, ...details }))
}

async function findBarOf(stripeSubscription: Stripe.Subscription) {
  // O checkout aberto pelo app grava o dono na assinatura; o cliente do
  // Stripe cobre a assinatura criada por fora (painel, portal).
  const customerId =
    typeof stripeSubscription.customer === 'string'
      ? stripeSubscription.customer
      : stripeSubscription.customer.id
  const userId = stripeSubscription.metadata?.userId
  const owner = userId
    ? await db.query.user.findFirst({ where: eq(user.id, userId) })
    : await db.query.user.findFirst({
        where: eq(user.stripeCustomerId, customerId)
      })
  if (!owner) return null
  return db.query.bar.findFirst({ where: eq(bar.userId, owner.id) })
}

/**
 * Grava no nosso banco o estado ATUAL de uma assinatura do Stripe.
 *
 * Recebe a assinatura como está no Stripe agora, não o corpo do evento: é o
 * que deixa o webhook idempotente e imune à ordem de entrega. Evento repetido
 * ou atrasado grava o mesmo estado de novo, nunca um estado antigo.
 *
 * Situação fora da tabela, preço desconhecido ou bar não encontrado não
 * gravam nada e não lançam: o reenvio do Stripe não conserta nenhum dos três,
 * quem resolve é a reconciliação a partir do log. Falha de banco lança, e aí
 * o Stripe reenvia.
 */
export async function applyStripeSubscription(
  stripeSubscription: Stripe.Subscription
) {
  const status = localStatusFor(stripeSubscription.status)
  if (!status) return

  const item = stripeSubscription.items.data[0]
  const plan = planForLookupKey(item?.price.lookup_key)
  if (!item || !plan) {
    logBillingError('stripe_webhook_unknown_price', {
      subscriptionId: stripeSubscription.id,
      priceId: item?.price.id ?? null,
      lookupKey: item?.price.lookup_key ?? null
    })
    return
  }

  const foundBar = await findBarOf(stripeSubscription)
  if (!foundBar) {
    logBillingError('stripe_webhook_bar_not_found', {
      subscriptionId: stripeSubscription.id,
      plan
    })
    return
  }

  const existing = await db.query.subscription.findFirst({
    where: eq(subscription.barId, foundBar.id)
  })
  // Encerramento de uma assinatura que não é a do bar: o aviso atrasado da
  // antiga não pode derrubar a nova.
  if (
    status === 'inactive' &&
    existing?.externalSubscriptionId &&
    existing.externalSubscriptionId !== stripeSubscription.id
  ) {
    return
  }

  const values = {
    status,
    plan,
    provider: 'stripe' as const,
    externalSubscriptionId: stripeSubscription.id,
    currentPeriodEnd: new Date(item.current_period_end * 1000),
    monthlyDiscountReais: monthlyDiscountReaisFromStripe(stripeSubscription)
  }
  await db
    .insert(subscription)
    .values({ barId: foundBar.id, ...values })
    .onConflictDoUpdate({ target: subscription.barId, set: values })
  await db
    .update(bar)
    .set({ isActive: status !== 'inactive' })
    .where(eq(bar.id, foundBar.id))
}

/**
 * Nome de quem paga e nome da empresa no cliente do Stripe (WEB-328): sempre
 * os do cadastro, o dono e o bar. É o que sai em recibo, fatura e portal. Os
 * dois campos próprios aceitam até 150 caracteres.
 */
export function customerNamesFor(ownerName: string, barName: string) {
  return {
    name: ownerName,
    individual_name: ownerName.slice(0, 150),
    business_name: barName.slice(0, 150)
  }
}

/**
 * Fim do checkout: nome e empresa do cliente voltam a ser os do cadastro
 * (WEB-328). A sessão vai com `customer_update.name: 'auto'` (ver
 * `stripe-checkout.ts`), então o Stripe pode ter gravado ali o nome do cartão
 * ou a razão social digitada junto do CNPJ.
 *
 * Recusa do Stripe só vai para o log: a assinatura já está gravada, e webhook
 * respondendo erro por causa de um nome não conserta nada.
 */
async function restoreCustomerNames(
  session: Stripe.Checkout.Session,
  client: Stripe
) {
  const customerId =
    typeof session.customer === 'string'
      ? session.customer
      : session.customer?.id
  if (!customerId) return
  const owner = await db.query.user.findFirst({
    where: eq(user.stripeCustomerId, customerId)
  })
  if (!owner) return
  const ownerBar = await db.query.bar.findFirst({
    where: eq(bar.userId, owner.id)
  })
  if (!ownerBar) return
  await client.customers
    .update(customerId, customerNamesFor(owner.name, ownerBar.name))
    .catch((error: unknown) =>
      logBillingError('stripe_customer_names_failed', {
        customerId,
        message: error instanceof Error ? error.message : String(error)
      })
    )
}

/** O que o plugin entrega em `onEvent`: todo evento já com a assinatura conferida. */
export async function syncStripeEvent(event: Stripe.Event, client: Stripe) {
  const subscriptionId = subscriptionIdOf(event)
  if (!subscriptionId) return
  await applyStripeSubscription(
    await client.subscriptions.retrieve(subscriptionId, {
      expand: ['discounts.source.coupon']
    })
  )
  if (event.type === 'checkout.session.completed') {
    await restoreCustomerNames(event.data.object, client)
  }
}
