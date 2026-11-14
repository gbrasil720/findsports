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
