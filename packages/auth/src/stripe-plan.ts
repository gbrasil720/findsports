export type Plan = 'starter' | 'pro' | 'elite'

/**
 * Fonte única dos planos vendidos no Stripe (WEB-31): o checkout vende estes
 * e o webhook só aplica estes.
 *
 * O preço é achado pela `lookupKey`, não por `price_...`: a mesma chave existe
 * no sandbox e em produção (PRO-5), então não há id por ambiente no código.
 */
export const STRIPE_PLANS: { name: Plan; lookupKey: string }[] = [
  { name: 'starter', lookupKey: 'starter_monthly' },
  { name: 'pro', lookupKey: 'pro_monthly' },
  { name: 'elite', lookupKey: 'elite_monthly' }
]

/**
 * Plano do preço do Stripe, ou `null` para preço ausente ou fora da lista.
 * Nunca cai num plano padrão (WEB-194): preço desconhecido não pode ativar
 * nem trocar plano.
 */
export function planForLookupKey(
  lookupKey: string | null | undefined
): Plan | null {
  return STRIPE_PLANS.find((p) => p.lookupKey === lookupKey)?.name ?? null
}
