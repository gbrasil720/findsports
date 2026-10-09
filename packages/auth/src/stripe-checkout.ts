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

type BarForCheckout = {
  name: string
  address: string
  neighborhood: string
  city: string
  uf: string | null
}

/**
 * Leva para o cliente do Stripe o que o bar já informou no cadastro, para o
 * checkout abrir com nome da empresa e endereço preenchidos em vez de pedir
 * tudo de novo. Só preenche o que está vazio: o que o dono corrigir no
 * checkout ou no portal fica como ele deixou.
 *
 * Nunca impede a venda: se o Stripe recusar, o checkout abre com os campos em
 * branco, como abriria sem isto.
 */
async function prefillCustomer(
  client: Stripe,
  customerId: string,
  ownerBar: BarForCheckout
) {
  try {
    const customer = await client.customers.retrieve(customerId)
    if (customer.deleted) return
    const update: Stripe.CustomerUpdateParams = {}
    if (!customer.business_name) update.business_name = ownerBar.name
    if (!customer.address) {
      update.address = {
        line1: ownerBar.address,
        line2: ownerBar.neighborhood,
        city: ownerBar.city,
        ...(ownerBar.uf ? { state: ownerBar.uf } : {}),
        country: 'BR'
      }
    }
    if (Object.keys(update).length > 0) {
      await client.customers.update(customerId, update)
    }
  } catch (error) {
    logBillingError('stripe_customer_prefill_failed', {
      customerId,
      message: error instanceof Error ? error.message : String(error)
    })
  }
}

/**
 * Parâmetros nossos da sessão de checkout, por cima dos do plugin.
 *
 * O que o checkout coleta é o que os Payment Links coletavam: endereço de
 * cobrança, nome de quem paga, nome da empresa e, se o dono quiser, o CNPJ.
 * Código promocional só quando não há cupom de fundador — o Stripe não aceita
 * os dois na mesma sessão.
 */
export async function checkoutParamsFor(
  userId: string,
  customerId: string | null | undefined,
  client: Stripe
): Promise<Stripe.Checkout.SessionCreateParams> {
  const ownerBar = await db.query.bar.findFirst({
    where: eq(bar.userId, userId),
    with: { subscription: true }
  })
  if (ownerBar && customerId) {
    await prefillCustomer(client, customerId, ownerBar)
  }
  const trialEnd = trialEndForCheckout(ownerBar?.subscription ?? null)
  const coupon = await usableFounderCoupon(client)
  return {
    locale: 'pt-BR',
    billing_address_collection: 'required',
    name_collection: {
      individual: { enabled: true },
      business: { enabled: true }
    },
    tax_id_collection: { enabled: true },
    ...(coupon ? { discounts: [{ coupon }] } : { allow_promotion_codes: true }),
    ...(trialEnd ? { subscription_data: { trial_end: trialEnd } } : {})
  }
}
