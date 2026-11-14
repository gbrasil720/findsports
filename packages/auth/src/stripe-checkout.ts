import { and, count, db, eq, gt } from '@findsports_oficial/db'
import { bar, subscription } from '@findsports_oficial/db/schema/platform'
import type Stripe from 'stripe'
import { ANNUAL_LOOKUP_KEYS, ANNUAL_MONTHS } from './stripe-plan'
import {
  customerDetailsFor,
  type InvoiceDetails,
  logBillingError,
  syncCustomerCnpj
} from './stripe-sync'

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
 * Cupom de fundador (WEB-31): R$ 28,00 a menos por mês, em qualquer plano e
 * enquanto a assinatura durar, para o bar que contratar durante o lançamento.
 * No Stripe é o cupom `Early Bird`, com este id no sandbox e em produção e
 * teto de 100 usos.
 *
 * Não há interruptor no app: a oferta acaba quando o cupom esgota ou expira
 * no Stripe, e daí em diante o checkout segue a preço de tabela
 * (`usableFounderCoupon`). Numa conta em que o cupom não existe é a mesma
 * coisa.
 */
export const FOUNDER_COUPON_ID = 'eM7dQpMF'

/**
 * Cupom de fundador do anual (decisão do dono, 14/11/2026: o desconto de
 * fundador vale no anual). O `FOUNDER_COUPON_ID` é de valor fixo por fatura, e
 * no anual tiraria R$ 28 do ano; este tira `ANNUAL_MONTHS` vezes isso, e o
 * anual do fundador sai 10 × o mensal de fundador. Mesmas vagas: os resgates
 * dos dois cupons e o Pix somam no teto.
 */
export const FOUNDER_ANNUAL_COUPON_ID = 'fundador_anual'

/** O desconto do cupom anual, em centavos: R$ 28 × 10 = R$ 280 por ano. */
export const FOUNDER_ANNUAL_AMOUNT_OFF = 2800 * ANNUAL_MONTHS

// O checkout e a `/plan` não esperam o Stripe: sem resposta em 5s, e sem nova
// tentativa, seguem adiante (o padrão do SDK são 80s e 2 tentativas).
export const QUICK_REQUEST = { timeout: 5000, maxNetworkRetries: 0 }

/** Vagas de fundador, cartão e Pix juntos; o cupom do Stripe tem o mesmo teto. */
export const FOUNDER_SEATS = 100

/**
 * Bares que entraram como fundador pelo Pix: o produto de fundador grava o
 * desconto na linha (`pix-sync.ts`). Contam enquanto a linha existir,
 * como o resgate do cupom, que não volta quando a assinatura acaba.
 */
export async function pixFounderCount(): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(subscription)
    .where(
      and(
        eq(subscription.provider, 'abacatepay'),
        gt(subscription.monthlyDiscountReais, 0)
      )
    )
  return row?.n ?? 0
}

/**
 * O que o Stripe disse do cupom. `unknown` é o Stripe sem responder (demora,
 * rede, erro 5xx): não é o mesmo que cupom que não vale.
 */
type FounderCouponState =
  | { state: 'valid' }
  | { state: 'invalid' }
  | { state: 'unknown'; message: string }

/** Quem conta os fundadores do Pix; os testes do cupom passam um sem banco. */
type CountPixFounders = () => Promise<number>

/** Resgates do cupom anual; cupom que não existe nesta conta não tem nenhum. */
async function annualRedemptions(client: Stripe): Promise<number> {
  try {
    const coupon = await client.coupons.retrieve(
      FOUNDER_ANNUAL_COUPON_ID,
      {},
      QUICK_REQUEST
    )
    return coupon.times_redeemed ?? 0
  } catch (error) {
    if ((error as { type?: string }).type === 'StripeInvalidRequestError') {
      return 0
    }
    throw error
  }
}

async function readFounderCoupon(
  client: Stripe,
  countPix: CountPixFounders
): Promise<FounderCouponState> {
  try {
    const coupon = await client.coupons.retrieve(
      FOUNDER_COUPON_ID,
      {},
      QUICK_REQUEST
    )
    if (!coupon.valid) return { state: 'invalid' }
    // As vagas de fundador somam cartão e Pix (decisão do dono, 11/11/2026):
    // o teto do cupom conta também quem entrou pelo Pix.
    const seats = coupon.max_redemptions ?? FOUNDER_SEATS
    // Conta mesmo com o Pix desligado: os fundadores que entraram por ele
    // seguem ocupando a vaga. Banco sem responder cai no `unknown` abaixo.
    // Os do anual também (WEB-442).
    const taken =
      (coupon.times_redeemed ?? 0) +
      (await annualRedemptions(client)) +
      (await countPix())
    return { state: taken < seats ? 'valid' : 'invalid' }
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
 * O Stripe não disse que o cupom deixou de valer.
 *
 * Stripe sem responder conta como "vale": o desconto de fundador é promessa
 * feita ao bar, e uma lentidão de 5s não pode fazê-lo contratar a preço de
 * tabela. Se o cupom tiver mesmo acabado, é a criação da sessão que recusa, e
 * o bar tenta de novo.
 */
export async function founderCouponUsable(
  client: Stripe,
  countPix: CountPixFounders = pixFounderCount
): Promise<boolean> {
  return (await readFounderCoupon(client, countPix)).state !== 'invalid'
}

/**
 * Vaga de fundador para um Pix novo: só com a contagem conferida. Ao
 * contrário do cartão, onde o Stripe recusa o cupom esgotado na sessão, o
 * produto de fundador do Pix não tem teto próprio, e `unknown` daria o
 * desconto sem saber se sobrou vaga.
 */
export async function pixFounderSeatAvailable(
  client: Stripe,
  countPix: CountPixFounders = pixFounderCount
): Promise<boolean> {
  return (await readFounderCoupon(client, countPix)).state === 'valid'
}

/**
 * Cupom de fundador a aplicar, ou `null`. Confere no Stripe antes: cupom
 * esgotado, apagado ou com o id errado faria o Stripe recusar a sessão
 * inteira, e o bar não conseguiria contratar por causa de um desconto.
 */
export async function usableFounderCoupon(
  client: Stripe,
  countPix: CountPixFounders = pixFounderCount,
  { annual = false }: { annual?: boolean } = {}
): Promise<string | null> {
  const couponId = annual ? FOUNDER_ANNUAL_COUPON_ID : FOUNDER_COUPON_ID
  const coupon = await readFounderCoupon(client, countPix)
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

/**
 * O plano anual está à venda (WEB-442): os três preços anuais existem e estão
 * ativos na conta do Stripe, com cobrança por ano, e o cupom de fundador do
 * anual existe com R$ 280 fixos para sempre — sem ele a tela prometeria um
 * preço de fundador que o checkout não daria. Enquanto o dono não cria tudo,
 * ou com o Stripe sem responder no teto, a tela mostra o "Anual" desligado e
 * o mensal segue igual.
 */
export async function annualPlansAvailable(
  client: Pick<Stripe, 'prices' | 'coupons'>
): Promise<boolean> {
  try {
    const [{ data }, coupon] = await Promise.all([
      client.prices.list(
        { lookup_keys: ANNUAL_LOOKUP_KEYS, active: true, limit: 10 },
        QUICK_REQUEST
      ),
      client.coupons.retrieve(FOUNDER_ANNUAL_COUPON_ID, {}, QUICK_REQUEST)
    ])
    const prices = ANNUAL_LOOKUP_KEYS.every((key) =>
      data.some(
        (price) =>
          price.lookup_key === key && price.recurring?.interval === 'year'
      )
    )
    return (
      prices &&
      coupon.amount_off === FOUNDER_ANNUAL_AMOUNT_OFF &&
      coupon.currency?.toLowerCase() === 'brl' &&
      coupon.duration === 'forever'
    )
  } catch {
    return false
  }
}

type BarForCustomer = {
  name: string
  address: string
  neighborhood: string
  city: string
  uf: string | null
} & Partial<InvoiceDetails>

/**
 * O que o cliente do Stripe recebe do cadastro antes do checkout (WEB-328).
 *
 * Nome e empresa são sempre regravados: a fonte é o cadastro, com a razão
 * social e o e-mail para notas do bar quando ele os informou (WEB-444). O endereço só
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
    ...customerDetailsFor(ownerName, ownerBar),
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
    // Só com CNPJ informado: sem ele, o que o dono digitar no checkout fica.
    if (ownerBar.cnpj) {
      await syncCustomerCnpj(client, customerId, ownerBar.cnpj, QUICK_REQUEST)
    }
  } catch (error) {
    logBillingError('stripe_customer_prefill_failed', {
      customerId,
      message: error instanceof Error ? error.message : String(error)
    })
  }
}

/**
 * "Dados da nota" salvos no painel (WEB-444): o cliente recebe tudo de uma
 * vez, com o CNPJ apagado no Stripe quando o dono o apagou aqui e o e-mail de
 * acesso de volta quando ele apagou o e-mail para notas. Ao contrário do
 * checkout, o erro do Stripe sobe: quem chama decide o que a tela diz.
 */
export async function pushInvoiceDetails(
  client: Pick<Stripe, 'customers'>,
  customerId: string,
  owner: { name: string; email: string },
  ownerBar: { name: string } & InvoiceDetails
) {
  await client.customers.update(
    customerId,
    customerDetailsFor(owner.name, ownerBar, owner.email),
    QUICK_REQUEST
  )
  await syncCustomerCnpj(client, customerId, ownerBar.cnpj, QUICK_REQUEST)
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
 *
 * Anual (WEB-442): o desconto de fundador vale nos dois (dono, 14/11/2026),
 * pelo cupom anual (`FOUNDER_ANNUAL_COUPON_ID`); sem ele, o anual vai a preço
 * de tabela e sem código promocional. O teste do cadastro vale nos dois:
 * `trial_end` é o mesmo.
 */
export async function checkoutParamsFor(
  owner: { id: string; name: string },
  customerId: string | null | undefined,
  client: Stripe,
  { annual = false }: { annual?: boolean } = {}
): Promise<Stripe.Checkout.SessionCreateParams> {
  const ownerBar = await db.query.bar.findFirst({
    where: eq(bar.userId, owner.id),
    with: { subscription: true }
  })
  if (ownerBar && customerId) {
    await prefillCustomer(client, customerId, owner.name, ownerBar)
  }
  const trialEnd = trialEndForCheckout(ownerBar?.subscription ?? null)
  const coupon = await usableFounderCoupon(client, pixFounderCount, {
    annual
  })
  return {
    locale: 'pt-BR',
    billing_address_collection: 'required',
    tax_id_collection: { enabled: true },
    customer_update: CUSTOMER_UPDATE,
    adaptive_pricing: { enabled: false },
    ...(coupon
      ? { discounts: [{ coupon }] }
      : annual
        ? {}
        : { allow_promotion_codes: true }),
    ...(trialEnd ? { subscription_data: { trial_end: trialEnd } } : {})
  }
}
