import { and, db, eq } from '@findsports_oficial/db'
import { aiAction, aiRun } from '@findsports_oficial/db/schema/ai'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import { fanProcedure, router } from '../index'
import {
  type ChatTurn,
  converse,
  MAX_HISTORY,
  MAX_MESSAGE_CHARS
} from '../lib/ai/chat'
import {
  contextCaller,
  runTool,
  type SearchArgs,
  type SearchBar,
  type ToolState
} from '../lib/ai/chat-tools'
import { assignVariant, chatAllowance } from '../lib/ai/limits'
import { CHAT_MODELS, type ChatVariant } from '../lib/ai/models'
import { aiGate, runAi } from '../lib/ai/run'
import { getAppConfig } from '../lib/app-config'

/*
 * Busca com IA do app (tela 2h, WEB-400), só para torcedor. A busca normal
 * nunca depende daqui: chat indisponível ou no limite, o Explorar e a busca
 * seguem como sempre.
 */

/** Nome do teste A/B do chat: entra no hash do sorteio. */
export const CHAT_EXPERIMENT = 'chat-2026-10'

/** O braço sorteado primeiro e o outro como reserva. */
function chatModels(variant: ChatVariant): [string, string] {
  const other: ChatVariant = variant === 'a' ? 'b' : 'a'
  return [CHAT_MODELS[variant], CHAT_MODELS[other]]
}

const turn = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().max(2000)
})

type Limit = { kind: 'limit'; scope: 'day' | 'month'; resumesAt: string }
type Unavailable = { kind: 'unavailable' }
type Answer = {
  kind: 'answer'
  runId: string
  text: string
  bars: SearchBar[]
  /** "Busquei por": o que a busca entendeu. */
  chips: string[]
  /** A busca que a tela refaz nos atalhos (oferta da casa, mais barato). */
  search:
    | (Omit<SearchArgs, 'cursor' | 'sort'> & { neighborhood: string | null })
    | null
  remainingToday: number
}

async function readGate(userId: string, now: Date) {
  const gate = await aiGate(userId, now)
  if (!gate.ok) {
    // Trava da própria pessoa: a tela diz quando volta. O resto (chave
    // desligada, sem Gateway, teto do mês de todo mundo) é "indisponível".
    if (gate.usage && gate.reason !== 'budget') {
      const allowance = chatAllowance(gate.usage, now, gate.limits)
      if (!allowance.ok)
        return {
          blocked: {
            kind: 'limit',
            scope: allowance.scope,
            resumesAt: allowance.resumesAt.toISOString()
          } satisfies Limit
        }
    }
    return { blocked: { kind: 'unavailable' } satisfies Unavailable }
  }
  const allowance = chatAllowance(gate.usage, now, gate.limits)
  if (!allowance.ok)
    return {
      blocked: {
        kind: 'limit',
        scope: allowance.scope,
        resumesAt: allowance.resumesAt.toISOString()
      } satisfies Limit
    }
  return { blocked: null, gate, allowance }
}

async function ownRun(runId: string, userId: string) {
  const [row] = await db
    .select({ runId: aiRun.runId })
    .from(aiRun)
    .where(and(eq(aiRun.runId, runId), eq(aiRun.userId, userId)))
  if (!row)
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Resposta não encontrada.'
    })
}

export const aiRouter = router({
  /** Se o chat abre agora e, no limite, quando volta. */
  status: fanProcedure.query(async ({ ctx }) => {
    const result = await readGate(ctx.session.user.id, new Date())
    if (result.blocked) return result.blocked
    return {
      kind: 'ready' as const,
      remainingToday: result.allowance.remainingToday,
      remainingMonth: result.allowance.remainingMonth
    }
  }),

  chat: fanProcedure
    .input(
      z.object({
        message: z.string().trim().min(1).max(MAX_MESSAGE_CHARS),
        history: z
          .array(turn)
          .max(MAX_HISTORY * 2)
          .default([]),
        origin: z
          .object({
            lat: z.number().min(-90).max(90),
            lng: z.number().min(-180).max(180)
          })
          .nullable()
          .default(null),
        radiusKm: z.number().int().min(1).max(50).optional()
      })
    )
    .mutation(async ({ ctx, input }): Promise<Answer | Limit | Unavailable> => {
      const now = new Date()
      const userId = ctx.session.user.id
      const result = await readGate(userId, now)
      if (result.blocked) return result.blocked

      const weights = await getAppConfig('ai.variant_weights')
      const variant = assignVariant(userId, CHAT_EXPERIMENT, weights.chat)
      const models = chatModels(variant)
      const caller = contextCaller(ctx)
      const state: ToolState = {
        bars: new Map(),
        opened: new Map(),
        lastSearch: null
      }
      const toolCtx = {
        caller,
        message: input.message,
        origin: input.origin,
        radiusKm: input.radiusKm ?? ctx.session.user.searchRadiusKm ?? 3,
        now
      }

      try {
        const outcome = await runAi(
          {
            userId,
            feature: 'chat',
            variant,
            assignedModel: models[0]
          },
          result.gate.deps,
          async (call) => {
            const turnResult = await converse(
              input.message,
              input.history as ChatTurn[],
              {
                call,
                models,
                runTool: (name, args) => runTool(name, args, toolCtx, state),
                state,
                now,
                hasOrigin: input.origin !== null
              }
            )
            return {
              value: turnResult.reply,
              status: turnResult.status,
              servedModel: turnResult.servedModel,
              useful: true
            }
          }
        )
        const reply = outcome.value
        if (reply.invented.length)
          console.warn(
            JSON.stringify({
              msg: 'ai.chat.invented_bar',
              runId: outcome.runId,
              ids: reply.invented
            })
          )
        return {
          kind: 'answer',
          runId: outcome.runId,
          text: reply.text,
          bars: reply.bars,
          chips: reply.search?.chips ?? [],
          search: reply.search
            ? { ...reply.search.args, neighborhood: reply.search.neighborhood }
            : null,
          remainingToday: result.allowance.remainingToday - 1
        }
      } catch (error) {
        console.error(
          JSON.stringify({
            msg: 'ai.chat.failed',
            error: error instanceof Error ? error.message : String(error)
          })
        )
        return { kind: 'unavailable' } satisfies Unavailable
      }
    }),

  /** Polegar para cima ou para baixo numa resposta; `null` desfaz. */
  feedback: fanProcedure
    .input(
      z.object({
        runId: z.string().uuid(),
        value: z.union([z.literal(1), z.literal(-1), z.null()])
      })
    )
    .mutation(async ({ ctx, input }) => {
      await ownRun(input.runId, ctx.session.user.id)
      await db
        .update(aiRun)
        .set({ feedback: input.value })
        .where(eq(aiRun.runId, input.runId))
      return { ok: true }
    }),

  /** O que a pessoa fez depois da resposta (métrica principal do teste). */
  action: fanProcedure
    .input(
      z.object({
        runId: z.string().uuid(),
        kind: z.enum(['open_bar', 'going', 'route']),
        barId: z.string().uuid().optional()
      })
    )
    .mutation(async ({ ctx, input }) => {
      await ownRun(input.runId, ctx.session.user.id)
      await db.insert(aiAction).values({
        runId: input.runId,
        kind: input.kind,
        barId: input.barId ?? null
      })
      return { ok: true }
    })
})
