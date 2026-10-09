import { env } from '@findsports_oficial/env/server'
import Stripe from 'stripe'

/**
 * Para onde o SDK fala. Só o E2E muda isso (`STRIPE_API_BASE_URL`, recusada em
 * produção pelo `packages/env`): lá a API do Stripe é o stub.
 */
function apiTarget(baseUrl: string | undefined) {
  if (!baseUrl) return {}
  const url = new URL(baseUrl)
  return {
    host: url.hostname,
    port: url.port,
    protocol: url.protocol.replace(':', '') as 'http' | 'https'
  }
}

// Sem chave o módulo ainda carrega (o deploy pode chegar antes do segredo):
// o SDK exige uma string, e com esta toda chamada volta 401 do Stripe.
export const stripeClient = new Stripe(
  env.STRIPE_SECRET_KEY ?? 'sk_test_ausente',
  apiTarget(env.STRIPE_API_BASE_URL)
)
