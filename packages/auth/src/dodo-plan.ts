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

/**
 * Modo da Dodo. Explícito vence (o preview roda com NODE_ENV=production e
 * chaves de teste); ausente, `production` → `live_mode`. O plugin do
 * better-auth deriva o modo do checkout do `baseURL` deste client.
 */
export function dodoEnvironment(
  configured: 'test_mode' | 'live_mode' | undefined,
  nodeEnv: 'development' | 'production' | 'test'
): 'test_mode' | 'live_mode' {
  return configured ?? (nodeEnv === 'production' ? 'live_mode' : 'test_mode')
}
