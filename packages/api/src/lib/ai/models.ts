/**
 * Modelos dos testes de IA (WEB-424) e quanto cada um custa. Ids e preços do
 * catálogo da Cloudflare (developers.cloudflare.com/ai/models) em 21/10/2026.
 */

/** Chat (WEB-400): braço a e b, mesmo formato (Chat Completions) nos dois. */
export const CHAT_MODELS = {
  a: 'google/gemini-2.5-flash',
  b: 'openai/gpt-6-luna'
} as const

/**
 * Reserva decidida pelo dono para o braço a, se o Gemini 2.5 Flash sair do
 * catálogo (o Google marcou a descontinuação para 16/10/2026). Trocar é mudar
 * `CHAT_MODELS.a` para este id.
 */
export const CHAT_A_RESERVE = 'google/gemini-3.5-flash-lite'

/** Recomendador (WEB-426): o braço a é só o algoritmo, sem modelo. */
export const RECOMMENDER_MODELS = {
  b: 'typesafe/jev',
  c: '@cf/cloudflare/clef-flash'
} as const

export type ChatVariant = keyof typeof CHAT_MODELS

/**
 * Raciocínio no mínimo nos dois braços do chat. O GPT-6 Luna só aceita
 * ferramentas no Chat Completions com `none`; o Gemini recusa `none`
 * (`7003 User Input Error`) e o mínimo dele é `minimal`, que ainda gasta uns
 * 17 tokens de raciocínio. Modelo `@cf/` recusa o campo.
 */
export function reasoningEffort(model: string) {
  if (model.startsWith('@cf/')) return undefined
  return model.startsWith('google/') ? 'minimal' : 'none'
}

/** US$ por milhão de tokens. */
const PRICES: Record<string, { in: number; out: number }> = {
  'google/gemini-2.5-flash': { in: 0.3, out: 2.5 },
  'google/gemini-3.5-flash-lite': { in: 0.3, out: 2.5 },
  'openai/gpt-6-luna': { in: 0.1, out: 0.5 },
  'typesafe/jev': { in: 0.042, out: 0 },
  '@cf/cloudflare/clef-flash': { in: 0.038, out: 0 }
}

/** Modelo da própria Cloudflare cobra em neurons: US$ 0,011 por mil. */
const USD_PER_NEURON = 0.011 / 1000

export type Usage = { tokensIn: number; tokensOut: number; neurons?: number }

/**
 * Custo de uma chamada. Modelo fora da tabela que informa neurons (os
 * `@cf/` usados só em desenvolvimento) paga por eles; sem nenhum dos dois,
 * custo zero, e o teto do Gateway continua valendo por cima.
 */
export function costUsd(model: string, usage: Usage) {
  const price = PRICES[model]
  if (price)
    return (usage.tokensIn * price.in + usage.tokensOut * price.out) / 1e6
  return (usage.neurons ?? 0) * USD_PER_NEURON
}
