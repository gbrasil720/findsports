export type Plan = 'starter' | 'pro' | 'elite'

const PLAN_BY_PRODUCT: Record<string, Plan> = {
  pdt_0NgxgZyV3AKsNe99Ae2ZN: 'starter',
  pdt_0NgxglMLDZdpaXIuRAiCE: 'pro',
  pdt_0NgxgzP6hnGWg1brokOcU: 'elite'
}

/**
 * Plano do produto da Dodo, ou `null` para produto ausente ou fora do mapa.
 * Nunca cai num plano padrão (WEB-194): produto desconhecido não pode ativar
 * nem trocar plano. `Object.hasOwn` evita que `toString` e afins do protótipo
 * passem por plano.
 */
export function planForProduct(productId: unknown): Plan | null {
  if (typeof productId !== 'string') return null
  if (!Object.hasOwn(PLAN_BY_PRODUCT, productId)) return null
  return PLAN_BY_PRODUCT[productId] ?? null
}
