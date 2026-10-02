type Plan = 'starter' | 'pro' | 'elite'

// Fonte única dos produtos da Dodo: o checkout vende estes e o webhook só
// aplica estes. `slug` é o plano.
export const DODO_PRODUCTS: { productId: string; slug: Plan }[] = [
  { productId: 'pdt_0NgxgZyV3AKsNe99Ae2ZN', slug: 'starter' },
  { productId: 'pdt_0NgxglMLDZdpaXIuRAiCE', slug: 'pro' },
  { productId: 'pdt_0NgxgzP6hnGWg1brokOcU', slug: 'elite' }
]

/**
 * Plano do produto da Dodo, ou `null` para produto ausente ou fora da lista.
 * Nunca cai num plano padrão (WEB-194): produto desconhecido não pode ativar
 * nem trocar plano.
 */
export function planForProduct(productId: string | undefined): Plan | null {
  return DODO_PRODUCTS.find((p) => p.productId === productId)?.slug ?? null
}
