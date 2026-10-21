/**
 * Teste de fumaça da IA (WEB-424): chama cada modelo dos testes uma vez pelo
 * AI Gateway e mostra resposta, tempo e custo. Mesmo caminho do servidor em
 * desenvolvimento (`getAiBinding`: API REST com o login do wrangler).
 *
 *   NODE_ENV=development bun --env-file=../../apps/web/.env run scripts/ai-smoke.ts [gateway]
 *
 * Custa centavos. Sem crédito no Gateway, o modelo de fora responde
 * `2021: Insufficient balance` e o script segue para o próximo.
 */

import { getAiBinding } from '../src/lib/ai/binding'
import {
  CHAT_A_RESERVE,
  CHAT_MODELS,
  costUsd,
  RECOMMENDER_MODELS,
  reasoningEffort
} from '../src/lib/ai/models'
import { readUsage } from '../src/lib/ai/run'

const gateway = process.argv[2] ?? 'default'
const binding = await getAiBinding()
if (!binding)
  throw new Error('Sem binding (NODE_ENV=development e CF_ACCOUNT_ID).')

const chat = {
  messages: [
    { role: 'system', content: 'Responda em português, numa frase.' },
    { role: 'user', content: 'Diga "ok" e o nome do seu modelo.' }
  ],
  max_completion_tokens: 60
}
const questions = {
  telao: {
    type: 'noul',
    instructions:
      'O bar serve para quem quer ver o jogo do Corinthians com telão?'
  }
}
const state =
  'Bar do Zé, Vila Madalena: telão, área externa, Corinthians × Palmeiras hoje 21:30.'

const cases: [string, Record<string, unknown>][] = [
  [
    CHAT_MODELS.a,
    { ...chat, reasoning_effort: reasoningEffort(CHAT_MODELS.a) }
  ],
  [
    CHAT_MODELS.b,
    { ...chat, reasoning_effort: reasoningEffort(CHAT_MODELS.b) }
  ],
  [
    CHAT_A_RESERVE,
    { ...chat, reasoning_effort: reasoningEffort(CHAT_A_RESERVE) }
  ],
  [RECOMMENDER_MODELS.b, { state, questions }],
  [RECOMMENDER_MODELS.c, { model: 'clef-flash', state, questions }]
]

for (const [model, input] of cases) {
  const started = performance.now()
  try {
    const raw = (await binding.run(model, input, {
      gateway: {
        id: gateway,
        metadata: {
          run_id: `smoke-${Date.now()}`,
          variant: 'smoke',
          feature: 'smoke'
        }
      }
    })) as {
      choices?: { message?: { content?: string } }[]
      answers?: unknown
      result?: { answers?: unknown }
    }
    const usage = readUsage(raw as never)
    console.log(
      JSON.stringify({
        model,
        ok: true,
        ms: Math.round(performance.now() - started),
        resposta:
          raw.choices?.[0]?.message?.content ??
          raw.answers ??
          raw.result?.answers,
        ...usage,
        custo_usd: Number(costUsd(model, usage).toFixed(6))
      })
    )
  } catch (error) {
    console.log(
      JSON.stringify({
        model,
        ok: false,
        ms: Math.round(performance.now() - started),
        erro: error instanceof Error ? error.message : String(error)
      })
    )
  }
}
process.exit(0)
