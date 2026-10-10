import { db, eq } from '@findsports_oficial/db'
import { bar } from '@findsports_oficial/db/schema/platform'
import type Stripe from 'stripe'
import { customerNamesFor, logBillingError } from './stripe-sync'

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

// O checkout e a `/plan` não esperam o Stripe: sem resposta em 5s, e sem nova
// tentativa, seguem adiante (o padrão do SDK são 80s e 2 tentativas).
export const QUICK_REQUEST = { timeout: 5000, maxNetworkRetries: 0 }

/**
 * O que o Stripe disse do cupom. `unknown` é o Stripe sem responder (demora,
 * rede, erro 5xx): não é o mesmo que cupom que não vale.
 */
type FounderCouponState =
  | { state: 'valid' }
  | { state: 'invalid' }
  | { state: 'unknown'; message: string }

async function readFounderCoupon(
  client: Stripe,
  couponId: string
): Promise<FounderCouponState> {
  try {
    const coupon = await client.coupons.retrieve(couponId, {}, QUICK_REQUEST)
    return { state: coupon.valid ? 'valid' : 'invalid' }
  } catch (error) {
    // Cupom apagado ou com o id errado: o Stripe respondeu, e a resposta é não.
    if ((error as { type?: string }).type === 'StripeInvalidRequestError') {
      return { state: 'invalid' }
    }
    return {
      state: 'unknown',
      message: error instanceof Error ? error.message : String(error)
    }
  }
}

/**
 * O cupom está configurado e o Stripe não disse que ele deixou de valer.
 *
 * Stripe sem responder conta como "vale": o desconto de fundador é promessa
 * feita ao bar, e uma lentidão de 5s não pode fazê-lo contratar a preço de
 * tabela. Se o cupom tiver mesmo acabado, é a criação da sessão que recusa, e
 * o bar tenta de novo.
 */
export async function founderCouponUsable(
  client: Stripe,
  couponId: string | null | undefined
): Promise<boolean> {
  if (!couponId) return false
  return (await readFounderCoupon(client, couponId)).state !== 'invalid'
}

/**
 * Cupom de fundador a aplicar, ou `null`. Confere no Stripe antes: cupom
 * esgotado, apagado ou com o id errado faria o Stripe recusar a sessão
 * inteira, e o bar não conseguiria contratar por causa de um desconto.
 */
export async function usableFounderCoupon(
  client: Stripe
): Promise<string | null> {
  const couponId = await founderCouponSource()
  if (!couponId) return null
  const coupon = await readFounderCoupon(client, couponId)
  if (coupon.state === 'invalid') {
    logBillingError('stripe_founder_coupon_unavailable', {
      couponId,
      reason: 'coupon_invalid'
    })
    return null
  }
  if (coupon.state === 'unknown') {
    // Segue com o cupom sem a conferência; o log deixa o rastro para o caso
    // de a sessão ser recusada logo depois.
    logBillingError('stripe_founder_coupon_unverified', {
      couponId,
      message: coupon.message
    })
  }
  return couponId
}

type BarForCustomer = {
  name: string
  address: string
  neighborhood: string
  city: string
  uf: string | null
}

/**
 * O que o cliente do Stripe recebe do cadastro antes do checkout (WEB-328).
 *
 * Nome e empresa são sempre regravados: a fonte é o cadastro. O endereço só
 * entra quando o cliente ainda não tem um — o dono pode ter posto outro
 * endereço de cobrança no checkout ou no portal, e essa edição fica. Sem CEP:
 * o cadastro não tem. Bar anterior à UF (WEB-270) vai sem estado.
 */
export function customerPrefillFor(
  customer: { address?: unknown },
  ownerName: string,
  ownerBar: BarForCustomer
): Stripe.CustomerUpdateParams {
  return {
    ...customerNamesFor(ownerName, ownerBar.name),
    ...(customer.address
      ? {}
      : {
          address: {
            line1: ownerBar.address,
            line2: ownerBar.neighborhood,
            city: ownerBar.city,
            ...(ownerBar.uf ? { state: ownerBar.uf } : {}),
            country: 'BR'
          }
        })
  }
}

// Nunca impede a venda: se o Stripe recusar, o checkout abre com o cliente
// como estava.
export async function prefillCustomer(
  client: Stripe,
  customerId: string,
  ownerName: string,
  ownerBar: BarForCustomer
) {
  try {
    const customer = await client.customers.retrieve(
      customerId,
      {},
      QUICK_REQUEST
    )
    if (customer.deleted) return
    await client.customers.update(
      customerId,
      customerPrefillFor(customer, ownerName, ownerBar),
      QUICK_REQUEST
    )
  } catch (error) {
    logBillingError('stripe_customer_prefill_failed', {
      customerId,
      message: error instanceof Error ? error.message : String(error)
    })
  }
}

/**
 * O que a sessão pode gravar no cliente. Endereço `auto`: o que o dono
 * digitar no checkout vira o endereço de cobrança dele.
 *
 * Nome `auto`, e não `never`: a documentação do Stripe manda `auto` para
 * `tax_id_collection` com cliente que já existe (docs.stripe.com/tax/checkout/
 * tax-ids, "Existing customers"). Em troca o checkout pode sobrescrever o
 * nome, e quem o devolve ao do cadastro é o webhook (`restoreCustomerNames`,
 * em `stripe-sync.ts`). Combinação a conferir no sandbox: se a API aceitar
 * `name: 'never'` com `tax_id_collection`, basta trocar aqui.
 */
const CUSTOMER_UPDATE = { name: 'auto', address: 'auto' } as const

/**
 * Parâmetros nossos da sessão de checkout, por cima dos do plugin (WEB-328).
 *
 * Nome de quem paga e nome da empresa não são pedidos no checkout: vêm do
 * cadastro, gravados no cliente do Stripe antes de a sessão abrir, junto do
 * endereço do bar. O checkout hospedado não mostra esses dados preenchidos
 * (conferido no sandbox em 09/10/2026: só o e-mail vem do cliente), então o
 * endereço de cobrança é digitado na primeira compra, e o CNPJ continua
 * opcional. Sem Adaptive Pricing: a cobrança é sempre em BRL, onde quer que
 * o navegador esteja.
 * Código promocional só quando não há cupom de fundador — o Stripe não aceita
 * os dois na mesma sessão.
 */
export async function checkoutParamsFor(
  owner: { id: string; name: string },
  customerId: string | null | undefined,
  client: Stripe
): Promise<Stripe.Checkout.SessionCreateParams> {
  const ownerBar = await db.query.bar.findFirst({
    where: eq(bar.userId, owner.id),
    with: { subscription: true }
  })
  if (ownerBar && customerId) {
    await prefillCustomer(client, customerId, owner.name, ownerBar)
  }
  const trialEnd = trialEndForCheckout(ownerBar?.subscription ?? null)
  const coupon = await usableFounderCoupon(client)
  return {
    locale: 'pt-BR',
    billing_address_collection: 'required',
    tax_id_collection: { enabled: true },
    customer_update: CUSTOMER_UPDATE,
    adaptive_pricing: { enabled: false },
    ...(coupon ? { discounts: [{ coupon }] } : { allow_promotion_codes: true }),
    ...(trialEnd ? { subscription_data: { trial_end: trialEnd } } : {})
  }
}
