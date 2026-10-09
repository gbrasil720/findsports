import { db, eq } from '@findsports_oficial/db'
import { bar } from '@findsports_oficial/db/schema/platform'
import type Stripe from 'stripe'
import { logBillingError } from './stripe-sync'

type TrialSubscription = {
  status: string
  currentPeriodEnd: Date | null
  externalSubscriptionId: string | null
} | null

// O Stripe recusa `trial_end` a menos de 48h de agora. A hora a mais é folga
// para o relógio e para o tempo que o dono leva no checkout.
const STRIPE_MIN_TRIAL_MS = 49 * 60 * 60 * 1000

/**
 * Fim do teste grátis que o checkout herda do cadastro (WEB-31), em segundos
 * Unix, ou `undefined` para cobrar na hora.
 *
 * O bar em teste grátis não deu cartão: o teste nasce no cadastro. Se ele
 * contrata antes do fim, o Stripe guarda o cartão e só cobra na data em que o
 * teste já ia acabar — contratar cedo não pode custar os dias que faltam.
 * Faltando menos de dois dias, a primeira cobrança sai no mínimo que o Stripe
 * aceita, um pouco depois do fim do teste.
 *
 * Teste vencido, ou assinatura que já existe no provedor, não herda nada.
 */
export function trialEndForCheckout(
  subscription: TrialSubscription,
  now = new Date()
): number | undefined {
  if (subscription?.status !== 'trialing') return undefined
  if (subscription.externalSubscriptionId) return undefined
  const end = subscription.currentPeriodEnd
  if (!end || end <= now) return undefined
  return Math.floor(
    Math.max(end.getTime(), now.getTime() + STRIPE_MIN_TRIAL_MS) / 1000
  )
}

/**
 * De onde vem o cupom de fundador. A chave `billing.founder_coupon` mora em
 * `packages/api`, que este pacote não pode importar (a dependência corre no
 * sentido oposto); quem enxerga os dois lados registra a leitura aqui —
 * `apps/web/src/routes/api/auth/$.ts`. Sem registro, nenhum cupom.
 */
let founderCouponSource: () => Promise<string | null> = async () => null

export function setFounderCouponSource(source: () => Promise<string | null>) {
  founderCouponSource = source
}

/**
 * Cupom de fundador a aplicar, ou `null`. Confere no Stripe antes: cupom
 * esgotado, apagado ou com o id errado faria o Stripe recusar a sessão
 * inteira, e o bar não conseguiria contratar por causa de um desconto.
 */
async function usableFounderCoupon(client: Stripe): Promise<string | null> {
  const couponId = await founderCouponSource()
  if (!couponId) return null
  const coupon = await client.coupons.retrieve(couponId).catch(() => null)
  if (coupon?.valid) return couponId
  logBillingError('stripe_founder_coupon_unavailable', { couponId })
  return null
}

/** Parâmetros nossos da sessão de checkout, por cima dos do plugin. */
export async function checkoutParamsFor(
  userId: string,
  client: Stripe
): Promise<Stripe.Checkout.SessionCreateParams> {
  const ownerBar = await db.query.bar.findFirst({
    where: eq(bar.userId, userId),
    with: { subscription: true }
  })
  const trialEnd = trialEndForCheckout(ownerBar?.subscription ?? null)
  const coupon = await usableFounderCoupon(client)
  return {
    locale: 'pt-BR',
    ...(coupon ? { discounts: [{ coupon }] } : {}),
    ...(trialEnd ? { subscription_data: { trial_end: trialEnd } } : {})
  }
}
