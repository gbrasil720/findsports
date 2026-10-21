import { db, sql } from '@findsports_oficial/db'
import { aiRun } from '@findsports_oficial/db/schema/ai'

import { getAppConfig } from '../app-config'
import { type AiBinding, aiGatewayId, getAiBinding } from './binding'
import {
  type AiBlock,
  brasiliaWindows,
  budgetBlock,
  type UserUsage
} from './limits'
import { costUsd } from './models'

/**
 * A chamada única à IA (WEB-424). Toda funcionalidade (chat, recomendador)
 * passa por `runAi`: ela confere as travas, chama o modelo pelo Gateway com
 * `run_id`, `variant` e `feature` nos metadados, e grava uma linha em
 * `ai_run` com o que a execução gastou, dê certo ou não.
 */

export type AiFeature = 'chat' | 'recommender'

export type AiRunMeta = {
  userId: string
  feature: AiFeature
  variant: string
  assignedModel: string
}

export type AiDeps = { binding: AiBinding; gatewayId: string }

export type AiCall = (
  model: string,
  input: Record<string, unknown>,
  opts?: { timeoutMs?: number }
) => Promise<unknown>

export type AiStatus = 'ok' | 'fallback' | 'error' | 'timeout'

export type AiOutcome<T> = {
  value: T
  status: AiStatus
  servedModel: string | null
  /** Mensagem do chat que desconta do limite (ver `ai_run.useful`). */
  useful: boolean
}

/** O modelo não respondeu a tempo; a chamada não desconta do limite. */
export class AiTimeoutError extends Error {
  constructor(model: string) {
    super(`IA sem resposta a tempo: ${model}`)
    this.name = 'AiTimeoutError'
  }
}

const DEFAULT_TIMEOUT_MS = 15_000

/** O que a pessoa e todo mundo já usaram, no dia e no mês de Brasília. */
export async function readUserUsage(
  userId: string,
  now = new Date()
): Promise<UserUsage> {
  const w = brasiliaWindows(now)
  const result = await db.execute<{
    calls_today: number
    chat_today: number
    chat_month: number
    user_cost: string | number
    total_cost: string | number
  }>(sql`
    SELECT
      count(*) FILTER (WHERE user_id = ${userId} AND created_at >= ${w.dayStart})::int AS calls_today,
      count(*) FILTER (WHERE user_id = ${userId} AND feature = 'chat' AND useful AND created_at >= ${w.dayStart})::int AS chat_today,
      count(*) FILTER (WHERE user_id = ${userId} AND feature = 'chat' AND useful)::int AS chat_month,
      coalesce(sum(cost_usd) FILTER (WHERE user_id = ${userId}), 0) AS user_cost,
      coalesce(sum(cost_usd), 0) AS total_cost
    FROM ai_run
    WHERE created_at >= ${w.monthStart} AND created_at < ${w.nextMonth}
  `)
  const row = result.rows[0]
  return {
    callsToday: row?.calls_today ?? 0,
    chatToday: row?.chat_today ?? 0,
    chatMonth: row?.chat_month ?? 0,
    userCostMonth: Number(row?.user_cost ?? 0),
    totalCostMonth: Number(row?.total_cost ?? 0)
  }
}

export type AiGate =
  | { ok: true; deps: AiDeps; usage: UserUsage }
  | {
      ok: false
      reason: 'disabled' | 'unavailable' | AiBlock
      usage: UserUsage | null
    }

/**
 * Se a IA pode ser chamada agora por esta pessoa: chave ligada, binding e
 * Gateway presentes, e dentro do teto do mês e das travas por pessoa.
 */
export async function aiGate(
  userId: string,
  now = new Date()
): Promise<AiGate> {
  if (!(await getAppConfig('ai.enabled')))
    return { ok: false, reason: 'disabled', usage: null }
  const binding = await getAiBinding().catch(() => null)
  const gatewayId = aiGatewayId()
  if (!binding || !gatewayId)
    return { ok: false, reason: 'unavailable', usage: null }
  const usage = await readUserUsage(userId, now)
  const block = budgetBlock(usage)
  if (block) return { ok: false, reason: block, usage }
  return { ok: true, deps: { binding, gatewayId }, usage }
}

type Usage = {
  prompt_tokens?: number
  completion_tokens?: number
  total_tokens?: number
  input_tokens?: number
  output_tokens?: number
  neurons?: number
}
type Raw = { usage?: Usage; result?: { usage?: Usage } }

/**
 * Tokens de uma resposta. Chat Completions traz `prompt_tokens` e
 * `total_tokens`; a saída é a diferença, porque o Gemini deixa o raciocínio
 * fora do `completion_tokens` e ele é cobrado como saída. Jev e Clef trazem
 * `input_tokens` e `output_tokens` (o Jev, dentro de `result`).
 */
export function readUsage(raw: Raw) {
  const u = raw?.usage ?? raw?.result?.usage
  const tokensIn = u?.prompt_tokens ?? u?.input_tokens ?? 0
  const tokensOut =
    u?.total_tokens !== undefined && u.prompt_tokens !== undefined
      ? u.total_tokens - u.prompt_tokens
      : (u?.completion_tokens ?? u?.output_tokens ?? 0)
  return { tokensIn, tokensOut, neurons: u?.neurons }
}

/**
 * Executa `fn` como uma execução de IA e grava a linha em `ai_run`. `fn`
 * recebe `call`, que fala com o modelo; ela decide o desfecho (status, quem
 * respondeu, se foi útil). Se `fn` lançar, a linha sai com `error` (ou
 * `timeout`) e o erro sobe.
 */
export async function runAi<T>(
  meta: AiRunMeta,
  deps: AiDeps,
  fn: (call: AiCall) => Promise<AiOutcome<T>>
): Promise<AiOutcome<T> & { runId: string }> {
  const runId = crypto.randomUUID()
  const started = performance.now()
  let tokensIn = 0
  let tokensOut = 0
  let cost = 0

  const call: AiCall = async (model, input, opts) => {
    const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new AiTimeoutError(model)), timeoutMs)
    })
    try {
      const raw = (await Promise.race([
        deps.binding.run(model, input, {
          gateway: {
            id: deps.gatewayId,
            metadata: {
              run_id: runId,
              variant: meta.variant,
              feature: meta.feature
            }
          }
        }),
        timeout
      ])) as Raw
      const usage = readUsage(raw)
      tokensIn += usage.tokensIn
      tokensOut += usage.tokensOut
      cost += costUsd(model, usage)
      return raw
    } finally {
      clearTimeout(timer)
    }
  }

  const write = (outcome: Omit<AiOutcome<unknown>, 'value'>) =>
    db.insert(aiRun).values({
      runId,
      userId: meta.userId,
      feature: meta.feature,
      variant: meta.variant,
      assignedModel: meta.assignedModel,
      servedModel: outcome.servedModel,
      latencyMs: Math.round(performance.now() - started),
      tokensIn,
      tokensOut,
      costUsd: cost,
      status: outcome.status,
      useful: outcome.useful
    })

  try {
    const outcome = await fn(call)
    await write(outcome)
    return { ...outcome, runId }
  } catch (error) {
    await write({
      status: error instanceof AiTimeoutError ? 'timeout' : 'error',
      servedModel: null,
      useful: false
    })
    throw error
  }
}
