import { and, db, eq, sql } from '@findsports_oficial/db'
import { aiRun } from '@findsports_oficial/db/schema/ai'

import { getAppConfig } from '../app-config'
import { type AiBinding, aiGatewayId, getAiBinding } from './binding'
import {
  type AiBlock,
  type AiLimits,
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

export type AiStatus = 'ok' | 'fallback' | 'error' | 'timeout' | 'stopped'

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

/** O torcedor parou a resposta (`ai.stop`): nenhuma chamada a mais ao modelo. */
export class AiStoppedError extends Error {
  constructor() {
    super('Resposta parada pelo torcedor.')
    this.name = 'AiStoppedError'
  }
}

const DEFAULT_TIMEOUT_MS = 15_000

/**
 * Para a execução em andamento de uma mensagem do chat (WEB-430). Só a da
 * própria pessoa e só enquanto roda: resposta pronta já descontou e não volta
 * atrás. A linha fica `stopped` e não útil; o gasto até aqui entra no fim.
 */
export async function stopRun(runId: string, userId: string) {
  const rows = await db
    .update(aiRun)
    .set({ status: 'stopped', useful: false })
    .where(
      and(
        eq(aiRun.runId, runId),
        eq(aiRun.userId, userId),
        eq(aiRun.feature, 'chat'),
        eq(aiRun.status, 'running')
      )
    )
    .returning({ runId: aiRun.runId })
  return rows.length > 0
}

/** Se o torcedor parou esta execução (`stopRun`). */
export async function wasStopped(runId: string) {
  const [row] = await db
    .select({ status: aiRun.status })
    .from(aiRun)
    .where(eq(aiRun.runId, runId))
  return row?.status === 'stopped'
}

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
  | { ok: true; deps: AiDeps; usage: UserUsage; limits: AiLimits }
  | {
      ok: false
      reason: 'disabled' | 'unavailable' | AiBlock
      usage: UserUsage | null
      limits: AiLimits
    }

/**
 * Se a IA pode ser chamada agora por esta pessoa: chave ligada, binding e
 * Gateway presentes, e dentro do teto do mês e das travas por pessoa
 * (`ai.limits`).
 */
export async function aiGate(
  userId: string,
  now = new Date()
): Promise<AiGate> {
  const [enabled, limits] = await Promise.all([
    getAppConfig('ai.enabled'),
    getAppConfig('ai.limits')
  ])
  if (!enabled) return { ok: false, reason: 'disabled', usage: null, limits }
  const binding = await getAiBinding().catch(() => null)
  const gatewayId = aiGatewayId()
  if (!binding || !gatewayId)
    return { ok: false, reason: 'unavailable', usage: null, limits }
  const usage = await readUserUsage(userId, now)
  const block = budgetBlock(usage, limits)
  if (block) return { ok: false, reason: block, usage, limits }
  return { ok: true, deps: { binding, gatewayId }, usage, limits }
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
 * recebe `call`, que fala com o modelo, e o `runId`; ela decide o desfecho
 * (status, quem respondeu, se foi útil). Se `fn` lançar, a linha sai com
 * `error` (ou `timeout`) e o erro sobe.
 *
 * A linha nasce `running` no começo, para o `ai.stop` ter o que parar, e é
 * completada no fim. Parada no meio, fica `stopped` e não útil, com o gasto.
 */
export async function runAi<T>(
  meta: AiRunMeta,
  deps: AiDeps,
  fn: (call: AiCall, runId: string) => Promise<AiOutcome<T>>
): Promise<AiOutcome<T> & { runId: string }> {
  const runId = crypto.randomUUID()
  const started = performance.now()
  await db.insert(aiRun).values({
    runId,
    userId: meta.userId,
    feature: meta.feature,
    variant: meta.variant,
    assignedModel: meta.assignedModel,
    status: 'running'
  })
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

  // O `stopped` do `ai.stop` ganha do desfecho, na mesma escrita: parar
  // depois da última chamada ao modelo também não desconta.
  const write = async (outcome: Omit<AiOutcome<unknown>, 'value'>) => {
    const [row] = await db
      .update(aiRun)
      .set({
        servedModel: outcome.servedModel,
        latencyMs: Math.round(performance.now() - started),
        tokensIn,
        tokensOut,
        costUsd: cost,
        status: sql`CASE WHEN ${aiRun.status} = 'stopped' THEN 'stopped' ELSE ${outcome.status} END`,
        useful: sql`${outcome.useful} AND ${aiRun.status} <> 'stopped'`
      })
      .where(eq(aiRun.runId, runId))
      .returning({ status: aiRun.status, useful: aiRun.useful })
    return row
  }

  try {
    const outcome = await fn(call, runId)
    const row = await write(outcome)
    return row?.status === 'stopped'
      ? { ...outcome, status: 'stopped', useful: false, runId }
      : { ...outcome, runId }
  } catch (error) {
    await write({
      status: error instanceof AiTimeoutError ? 'timeout' : 'error',
      servedModel: null,
      useful: false
    })
    throw error
  }
}
