import { db, eq, sql } from '@findsports_oficial/db'
import { stripeSubscription } from '@findsports_oficial/db/schema/auth'
import { bar } from '@findsports_oficial/db/schema/platform'
import { waitlistEntries } from '@findsports_oficial/db/schema/waitlist'
import { APIError } from 'better-auth/api'
import type Stripe from 'stripe'
import { liveStripeSubscriptionId } from './account-deletion-policy'
import { QUICK_REQUEST } from './stripe-checkout'
import { logBillingError } from './stripe-sync'

/**
 * Antes de apagar a conta: encerra na hora, no Stripe, a assinatura que ainda
 * existe lá (WEB-336). Cancelamento já agendado e assinatura pausada caem no
 * mesmo caminho. Sem proração nem fatura final, que é o padrão do `cancel`: o
 * período pago não é devolvido. O reembolso dos 7 dias da primeira
 * contratação é pedido ao suporte, que acha o caso pela linha de log daqui.
 *
 * Stripe recusando ou sem responder, lança, e a conta fica: não pode sobrar
 * assinatura cobrando sem dono.
 */
export async function endLiveSubscriptionOf(userId: string, client: Stripe) {
  const accountBar = await db.query.bar.findFirst({
    where: eq(bar.userId, userId),
    with: { subscription: true }
  })
  const subscriptionId = liveStripeSubscriptionId(
    accountBar?.subscription ?? null
  )
  if (!subscriptionId) return

  try {
    // Lida antes: se o Stripe já a encerrou (aviso que ainda não chegou, ou
    // nova tentativa depois de uma exclusão que parou no meio), não há o que
    // cancelar, e cancelar de novo seria recusado.
    const current = await client.subscriptions.retrieve(
      subscriptionId,
      {},
      QUICK_REQUEST
    )
    if (current.status === 'canceled') return
    await client.subscriptions.cancel(subscriptionId, {}, QUICK_REQUEST)
    console.info(
      JSON.stringify({
        level: 'info',
        event: 'account_deletion_subscription_ended',
        userId,
        customerId:
          typeof current.customer === 'string'
            ? current.customer
            : current.customer.id,
        subscriptionId
      })
    )
  } catch (error) {
    logBillingError('account_deletion_subscription_cancel_failed', {
      userId,
      subscriptionId,
      message: error instanceof Error ? error.message : String(error)
    })
    throw new APIError('SERVICE_UNAVAILABLE', {
      message:
        'Não foi possível encerrar a assinatura agora, e a conta não foi excluída. Tente de novo em instantes.',
      code: 'SUBSCRIPTION_CANCEL_FAILED'
    })
  }
}

/**
 * Depois de apagar a conta: a inscrição da waitlist com o e-mail dela sai
 * junto (WEB-342). Não há FK entre as duas, a ligação é só o e-mail.
 */
export async function deleteWaitlistEntryOf(email: string) {
  await db
    .delete(waitlistEntries)
    .where(sql`lower(${waitlistEntries.email}) = ${email.toLowerCase()}`)
}

/**
 * Depois de apagar a conta: a linha que o plugin do Stripe guarda da
 * assinatura sai junto. `stripe_subscription` não tem FK para `user`, e
 * ficaria com o id do dono e o do cliente do Stripe de quem foi apagado.
 */
export async function deleteStripeSubscriptionOf(userId: string) {
  await db
    .delete(stripeSubscription)
    .where(eq(stripeSubscription.referenceId, userId))
}
