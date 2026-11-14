export type Plan = 'starter' | 'pro' | 'elite'

/**
 * O plano anual sai pelo preço de 10 meses: "2 meses grátis" (decisão do
 * dono, 28/10/2026, WEB-442). O preço anual no Stripe tem de valer isto vezes
 * a tabela mensal.
 */
export const ANNUAL_MONTHS = 10

/**
 * Fonte única dos planos vendidos no Stripe (WEB-31): o checkout vende estes
 * e o webhook só aplica estes.
 *
 * O preço é achado pela `lookupKey`, não por `price_...`: a mesma chave existe
 * no sandbox e em produção (PRO-5), então não há id por ambiente no código.
 * O anual (`annualDiscountLookupKey`, o nome que o plugin dá) é o mesmo plano
 * cobrado por ano (WEB-442): enquanto o preço não existe na conta, o checkout
 * anual é recusado e a tela mostra o "Anual" desligado.
 */
export const STRIPE_PLANS: {
  name: Plan
  lookupKey: string
  annualDiscountLookupKey: string
}[] = [
  {
    name: 'starter',
    lookupKey: 'starter_monthly',
    annualDiscountLookupKey: 'starter_yearly'
  },
  {
    name: 'pro',
    lookupKey: 'pro_monthly',
    annualDiscountLookupKey: 'pro_yearly'
  },
  {
    name: 'elite',
    lookupKey: 'elite_monthly',
    annualDiscountLookupKey: 'elite_yearly'
  }
]

export const ANNUAL_LOOKUP_KEYS = STRIPE_PLANS.map(
  (plan) => plan.annualDiscountLookupKey
)

/**
 * Plano do preço do Stripe, mensal ou anual, ou `null` para preço ausente ou
 * fora da lista. Nunca cai num plano padrão (WEB-194): preço desconhecido não
 * pode ativar nem trocar plano.
 */
export function planForLookupKey(
  lookupKey: string | null | undefined
): Plan | null {
  if (!lookupKey) return null
  return (
    STRIPE_PLANS.find(
      (p) =>
        p.lookupKey === lookupKey || p.annualDiscountLookupKey === lookupKey
    )?.name ?? null
  )
}

/** Preço de tabela do mês, em reais: o mesmo do Stripe e dos produtos do Pix. */
export const TABLE_PRICE_REAIS: Record<Plan, number> = {
  starter: 97,
  pro: 147,
  elite: 297
}

/** Desconto de fundador por mês, em reais (cupom do Stripe e produto do Pix). */
export const FOUNDER_DISCOUNT_REAIS = 28

/**
 * O que o bar paga por mês num plano: tabela ou fundador, e no anual o ano
 * (10 meses) dividido por 12.
 */
export function monthlyPriceReais(
  plan: Plan,
  { founder, annual = false }: { founder: boolean; annual?: boolean }
): number {
  const month = TABLE_PRICE_REAIS[plan] - (founder ? FOUNDER_DISCOUNT_REAIS : 0)
  return annual ? (month * ANNUAL_MONTHS) / 12 : month
}

/**
 * O que o bar paga por mês no Pix, pelo desconto da fatura gravado na linha:
 * no anual, o ano (10 meses de tabela menos o desconto do ano) em 12.
 */
export function pixMonthlyReais(
  plan: Plan,
  discountReais: number,
  annual: boolean
): number {
  return annual
    ? (TABLE_PRICE_REAIS[plan] * ANNUAL_MONTHS - discountReais) / 12
    : TABLE_PRICE_REAIS[plan] - discountReais
}

/** Menor cobrança em real que o Stripe aceita: R$ 0,50. */
const STRIPE_MIN_BRL_CENTS = 50

/**
 * Subida de plano do Pix para o cartão (dono, 14/11/2026, WEB-536): o cartão
 * cobra hoje a diferença entre o que o bar vai pagar e o que paga no Pix, pelo
 * que falta do mês já pago (`paidUntil`), em centavos. O ciclo do Pix é de um
 * mês, que acaba em `paidUntil`. Descida e mesmo preço não cobram nada, e
 * diferença abaixo do mínimo do Stripe também não.
 */
export function pixUpgradeCents({
  currentMonthlyReais,
  newMonthlyReais,
  paidUntil,
  now = new Date()
}: {
  currentMonthlyReais: number
  newMonthlyReais: number
  paidUntil: Date
  now?: Date
}): number {
  const diff = newMonthlyReais - currentMonthlyReais
  const left = paidUntil.getTime() - now.getTime()
  if (diff <= 0 || left <= 0) return 0
  const start = new Date(paidUntil)
  start.setUTCMonth(start.getUTCMonth() - 1)
  const fraction = Math.min(1, left / (paidUntil.getTime() - start.getTime()))
  const cents = Math.round(diff * 100 * fraction)
  return cents < STRIPE_MIN_BRL_CENTS ? 0 : cents
}
