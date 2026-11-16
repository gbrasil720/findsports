import { count, db, eq, inArray } from '@findsports_oficial/db'
import { user } from '@findsports_oficial/db/schema/auth'
import { bar, subscription } from '@findsports_oficial/db/schema/platform'
import { env } from '@findsports_oficial/env/server'
import type Stripe from 'stripe'
import {
  ANNUAL_LOOKUP_KEYS,
  ANNUAL_MONTHS,
  CARD_FROM_PIX_KEY,
  FOUNDER_ANNUAL_COUPON_ID,
  FOUNDER_COUPON_ID,
  FOUNDER_DISCOUNT_REAIS,
  monthlyPriceReais,
  type Plan,
  pixMonthlyReais,
  pixUpgradeCents,
  STRIPE_PLANS
} from './stripe-plan'
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
  provider?: string | null
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
 * Do Pix para o cartão (WEB-536) é o mesmo mecanismo: o mês já pago no Pix
 * vale até `currentPeriodEnd`, e o cartão só cobra dali em diante. O Pix é
 * cancelado quando o cartão se confirma (`applyStripeSubscription`).
 *
 * Teste vencido, ou assinatura que já existe no Stripe, não herda nada.
 */
export function trialEndForCheckout(
  subscription: TrialSubscription,
  now = new Date()
): number | undefined {
  const pixPaid =
    subscription?.provider === 'abacatepay' &&
    subscription.status === 'active' &&
    Boolean(subscription.externalSubscriptionId)
  if (!pixPaid) {
    if (subscription?.status !== 'trialing') return undefined
    if (subscription.externalSubscriptionId) return undefined
  }
  const end = subscription.currentPeriodEnd
  if (!end || end <= now) return undefined
  return Math.floor(
    Math.max(end.getTime(), now.getTime() + STRIPE_MIN_TRIAL_MS) / 1000
  )
}

export { FOUNDER_ANNUAL_COUPON_ID, FOUNDER_COUPON_ID }

/** O desconto do cupom anual, em centavos: R$ 28 × 10 = R$ 280 por ano. */
export const FOUNDER_ANNUAL_AMOUNT_OFF = 2800 * ANNUAL_MONTHS

// O checkout e a `/plan` não esperam o Stripe: sem resposta em 5s, e sem nova
// tentativa, seguem adiante (o padrão do SDK são 80s e 2 tentativas).
export const QUICK_REQUEST = { timeout: 5000, maxNetworkRetries: 0 }

/** Vagas de fundador, cartão e Pix juntos. O teto é do app, não do cupom. */
export const FOUNDER_SEATS = 100

/** O desconto de fundador gravado na linha: R$ 28 no mensal, R$ 280 no anual. */
const FOUNDER_DISCOUNTS = [
  FOUNDER_DISCOUNT_REAIS,
  FOUNDER_DISCOUNT_REAIS * ANNUAL_MONTHS
]

/**
 * Vagas de fundador ocupadas: bares com o desconto de fundador na linha de
 * `subscription` (cartão e Pix; uma linha por bar). Contam enquanto a linha
 * existir, também com a assinatura encerrada, como o resgate de cupom que não
 * volta. Não usa `times_redeemed` do Stripe: a troca do cupom de fundador
 * entre mensal e anual (`stripe-sync.ts`) resgata de novo, e o bar contaria
 * duas vezes.
 *
 * ponytail: reconhece o fundador pelo valor; um código promocional de
 * exatamente R$ 28 ou R$ 280 contaria como vaga. Uma coluna própria resolve
 * se isso aparecer.
 */
export async function founderSeatCount(
  executor: Pick<typeof db, 'select'> = db
): Promise<number> {
  const [row] = await executor
    .select({ n: count() })
    .from(subscription)
    .where(inArray(subscription.monthlyDiscountReais, FOUNDER_DISCOUNTS))
  return row?.n ?? 0
}

/**
 * O que se sabe da oferta. `unknown` é a conta que não fechou: o Stripe sem
 * responder (demora, rede, erro 5xx, chave ausente) ou o banco, em `source`.
 * Não é o mesmo que cupom que não vale.
 */
type FounderCouponState =
  | { state: 'valid' }
  | { state: 'invalid' }
  | { state: 'unknown'; source: 'stripe' | 'db'; message: string }

/** Quem conta as vagas ocupadas; os testes do cupom passam um sem banco. */
type CountFounderSeats = () => Promise<number>

const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : String(error)

/**
 * A oferta de fundador: o cupom do Stripe valendo (o dono a encerra lá) e
 * vaga sobrando na conta do app (`founderSeatCount`).
 */
export async function readFounderCoupon(
  client: Stripe,
  countSeats: CountFounderSeats
): Promise<FounderCouponState> {
  let valid: boolean
  try {
    const coupon = await client.coupons.retrieve(
      FOUNDER_COUPON_ID,
      {},
      QUICK_REQUEST
    )
    valid = coupon.valid
  } catch (error) {
    // Cupom apagado ou com o id errado: o Stripe respondeu, e a resposta é não.
    if ((error as { type?: string }).type === 'StripeInvalidRequestError') {
      return { state: 'invalid' }
    }
    return { state: 'unknown', source: 'stripe', message: messageOf(error) }
  }
  if (!valid) return { state: 'invalid' }
  try {
    // As vagas somam cartão e Pix (dono, 11/11/2026), e o anual (WEB-442).
    const taken = await countSeats()
    return { state: taken < FOUNDER_SEATS ? 'valid' : 'invalid' }
  } catch (error) {
    return { state: 'unknown', source: 'db', message: messageOf(error) }
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
  countSeats: CountFounderSeats = founderSeatCount
): Promise<boolean> {
  return (await readFounderCoupon(client, countSeats)).state !== 'invalid'
}

/**
 * Vaga de fundador para um Pix novo: só com a contagem conferida. Ao
 * contrário do cartão, onde o Stripe recusa o cupom esgotado na sessão, o
 * produto de fundador do Pix não tem teto próprio, e `unknown` daria o
 * desconto sem saber se sobrou vaga.
 */
export async function pixFounderSeatAvailable(
  client: Stripe,
  countSeats: CountFounderSeats = founderSeatCount
): Promise<boolean> {
  return (await readFounderCoupon(client, countSeats)).state === 'valid'
}

/**
 * Cupom de fundador a aplicar, ou `null`. Confere no Stripe antes: cupom
 * esgotado, apagado ou com o id errado faria o Stripe recusar a sessão
 * inteira, e o bar não conseguiria contratar por causa de um desconto.
 */
export async function usableFounderCoupon(
  client: Stripe,
  countSeats: CountFounderSeats = founderSeatCount,
  { annual = false }: { annual?: boolean } = {}
): Promise<string | null> {
  const couponId = annual ? FOUNDER_ANNUAL_COUPON_ID : FOUNDER_COUPON_ID
  const coupon = await readFounderCoupon(client, countSeats)
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
  {
    annual = false,
    plan,
    countSeats: count = founderSeatCount
  }: {
    annual?: boolean
    plan?: Plan
    /** Vagas ocupadas; os testes passam uma conta sem encher o banco. */
    countSeats?: CountFounderSeats
  } = {}
): Promise<Stripe.Checkout.SessionCreateParams> {
  const ownerBar = await db.query.bar.findFirst({
    where: eq(bar.userId, owner.id),
    with: { subscription: true }
  })
  if (ownerBar && customerId) {
    await prefillCustomer(client, customerId, owner.name, ownerBar)
  }
  const current = ownerBar?.subscription ?? null
  const trialEnd = trialEndForCheckout(current)
  // Fundador do Pix que passa para o cartão (WEB-536) leva a vaga junto: ela
  // sai da conta do Pix quando a linha virar do Stripe e entra no resgate do
  // cupom. Sem descontar a dele, com as vagas cheias ele perderia o desconto.
  const pixFounder =
    current?.provider === 'abacatepay' &&
    current.status === 'active' &&
    (current.monthlyDiscountReais ?? 0) > 0
  const countSeats = pixFounder
    ? async () => Math.max(0, (await count()) - 1)
    : count
  const coupon = await usableFounderCoupon(client, countSeats, { annual })
  // Subida do Pix para o cartão (dono, 14/11/2026): a diferença até o fim do
  // ciclo pago (mês ou ano) sai hoje, como item avulso da sessão (`startCardFromPix`).
  const upgradeCents =
    plan &&
    current?.provider === 'abacatepay' &&
    trialEnd &&
    current.currentPeriodEnd
      ? pixUpgradeCents({
          currentMonthlyReais: pixMonthlyReais(
            current.plan,
            current.monthlyDiscountReais ?? 0,
            current.billingInterval === 'year'
          ),
          newMonthlyReais: monthlyPriceReais(plan, {
            founder: coupon !== null,
            annual
          }),
          paidUntil: current.currentPeriodEnd,
          annual: current.billingInterval === 'year'
        })
      : 0
  // Com a diferença na sessão, o cupom (valor fixo por fatura) a descontaria
  // do item avulso, e o código promocional também: o cupom vai na
  // assinatura, e quem o aplica é o webhook (`applyUpgradeCoupon`).
  const upgrade = upgradeCents > 0
  return {
    locale: 'pt-BR',
    billing_address_collection: 'required',
    tax_id_collection: { enabled: true },
    customer_update: CUSTOMER_UPDATE,
    adaptive_pricing: { enabled: false },
    ...(coupon && !upgrade
      ? { discounts: [{ coupon }] }
      : annual || upgrade
        ? {}
        : { allow_promotion_codes: true }),
    ...(trialEnd
      ? {
          subscription_data: {
            trial_end: trialEnd,
            ...(upgrade
              ? {
                  metadata: {
                    pixUpgradeCents: String(upgradeCents),
                    ...(coupon ? { founderCoupon: coupon } : {})
                  }
                }
              : {})
          }
        }
      : {})
  }
}

/** Recusa da passagem do Pix para o cartão, com a frase para a tela. */
export class CardFromPixRefusal extends Error {}

const UPGRADE_ITEM_NAME =
  'Diferença da troca de plano até o fim do período pago no Pix'

/**
 * Do Pix para o cartão (WEB-536): a sessão de checkout é nossa, não do plugin,
 * porque a subida cobra a diferença na hora (dono, 14/11/2026) e o plugin não
 * deixa a sessão levar item avulso. Com o item, o Stripe cobra a diferença na
 * própria tela do checkout, junto com o cartão guardado para a mensalidade:
 * cartão recusado fica ali, o dono tenta outro, e nenhuma assinatura nasce.
 * Paga, o webhook cancela o Pix e troca a linha (`applyStripeSubscription`).
 * A assinatura entra no plugin pelo `customer.subscription.created`, como a
 * criada no painel do Stripe: o portal e as trocas seguintes funcionam igual.
 *
 * Mesmo plano e descida usam a mesma sessão, sem o item: o cartão só cobra
 * no fim do mês pago. Sem a chave da AbacatePay, recusa: o Pix não seria
 * cancelado e o bar pagaria os dois.
 */
export async function startCardFromPix(
  owner: { id: string; name: string; email: string },
  { plan, annual = false }: { plan: Plan; annual?: boolean },
  client: Stripe,
  appUrl: string,
  // Sem a chave, o webhook do cartão não consegue cancelar o Pix.
  { pixCancellable = Boolean(env.ABACATE_PAY_API_KEY) } = {}
): Promise<{ url: string }> {
  const ownerBar = await db.query.bar.findFirst({
    where: eq(bar.userId, owner.id),
    with: { subscription: true }
  })
  const current = ownerBar?.subscription
  if (
    current?.provider !== 'abacatepay' ||
    current.status !== 'active' ||
    !current.externalSubscriptionId
  ) {
    throw new CardFromPixRefusal('Sua assinatura não está no Pix.')
  }
  if (!pixCancellable) {
    throw new CardFromPixRefusal(
      'A troca para o cartão está indisponível agora. Tente de novo mais tarde.'
    )
  }

  const ownerRow = await db.query.user.findFirst({
    where: eq(user.id, owner.id),
    columns: { stripeCustomerId: true }
  })
  let customerId = ownerRow?.stripeCustomerId ?? null
  if (!customerId) {
    const created = await client.customers.create(
      { email: owner.email, name: owner.name, metadata: { userId: owner.id } },
      QUICK_REQUEST
    )
    customerId = created.id
    await db
      .update(user)
      .set({ stripeCustomerId: customerId })
      .where(eq(user.id, owner.id))
  }

  const lookupKey = STRIPE_PLANS.find((p) => p.name === plan)?.[
    annual ? 'annualDiscountLookupKey' : 'lookupKey'
  ]
  const { data: prices } = await client.prices.list(
    { lookup_keys: lookupKey ? [lookupKey] : [], active: true, limit: 1 },
    QUICK_REQUEST
  )
  const price = prices[0]
  if (!price) {
    throw new CardFromPixRefusal(
      'Este plano está indisponível no cartão agora. Tente de novo mais tarde.'
    )
  }

  const params = await checkoutParamsFor(owner, customerId, client, {
    annual,
    plan
  })
  const upgradeCents = Number(
    (params.subscription_data?.metadata as Record<string, string> | undefined)
      ?.pixUpgradeCents ?? 0
  )
  const back = new URL('/plan', appUrl)
  back.searchParams.set('troca', 'cartao')
  back.searchParams.set('para', plan)
  if (annual) back.searchParams.set('anual', '1')
  const session = await client.checkout.sessions.create({
    ...params,
    mode: 'subscription',
    customer: customerId,
    client_reference_id: owner.id,
    line_items: [
      { price: price.id, quantity: 1 },
      ...(upgradeCents > 0
        ? [
            {
              quantity: 1,
              price_data: {
                currency: 'brl',
                unit_amount: upgradeCents,
                product_data: { name: UPGRADE_ITEM_NAME }
              }
            }
          ]
        : [])
    ],
    success_url: new URL('/plan/confirmed', appUrl).href,
    cancel_url: back.href,
    metadata: { userId: owner.id },
    subscription_data: {
      ...params.subscription_data,
      metadata: {
        ...(params.subscription_data?.metadata as Record<string, string>),
        [CARD_FROM_PIX_KEY]: '1',
        userId: owner.id
      }
    }
  })
  if (!session.url) throw new Error('Stripe não devolveu a URL do checkout.')
  return { url: session.url }
}
