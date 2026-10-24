import { runInBackground } from '@findsports_oficial/auth/background'
import { and, db, eq, isNull, or } from '@findsports_oficial/db'
import { eventNotEndedSql } from '@findsports_oficial/db/event-window-sql'
import { gameTitle, matchSides } from '@findsports_oficial/db/game-title'
import { aiAction, aiProposal, aiRun } from '@findsports_oficial/db/schema/ai'
import { bar } from '@findsports_oficial/db/schema/platform'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import type { Context } from '../context'
import { fanProcedure, router } from '../index'
import {
  converse,
  MAX_HISTORY,
  MAX_MESSAGE_CHARS,
  PROPOSAL_RULE
} from '../lib/ai/chat'
import {
  contextCaller,
  dateOf,
  hour,
  type PendingProposal,
  PROPOSAL_NAMES,
  runTool,
  type ToolState
} from '../lib/ai/chat-tools'
import {
  type ChatEvent,
  type ConfirmFailure,
  type Emit,
  eventQueue,
  type Proposal
} from '../lib/ai/events'
import { assignVariant, chatAllowance } from '../lib/ai/limits'
import { CHAT_MODELS, type ChatVariant } from '../lib/ai/models'
import { aiGate, runAi } from '../lib/ai/run'
import { getAppConfig } from '../lib/app-config'
import { createFriendCall } from '../lib/friend-calls'
import { byMatchOrder } from '../lib/game-participants'
import { attendanceRouter } from './attendance'
import { recommendationsRouter } from './recommendations'

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

const originInput = z
  .object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180)
  })
  .nullable()
  .default(null)

const converseInput = z.object({
  message: z.string().trim().min(1).max(MAX_MESSAGE_CHARS),
  history: z
    .array(turn)
    .max(MAX_HISTORY * 2)
    .default([]),
  origin: originInput,
  placeLabel: z.string().trim().max(80).nullable().default(null),
  radiusKm: z.number().int().min(1).max(50).optional(),
  day: z.enum(['today', 'tomorrow']).nullable().default(null),
  useTastes: z.boolean().default(false),
  redo: z.boolean().optional()
})

type FanContext = Context & {
  session: NonNullable<Context['session']>
}

/** "Meus gostos": esportes, times e raio do perfil, como dado para o modelo. */
async function readTastes(ctx: FanContext) {
  const caller = contextCaller(ctx)
  const [sports, teams] = await Promise.all([
    caller.getMyPreferences(),
    caller.getMyTeams()
  ])
  return {
    sports: sports.map((s) => s.sport.name),
    teams: teams.map((t) => t.name),
    radiusKm: ctx.session.user.searchRadiusKm ?? null
  }
}

const GOING_LABEL = 'Marcar “Vou assistir aqui”'

/** A proposta como o app a recebe (24d). */
export function toProposal(id: string, p: PendingProposal): Proposal {
  return {
    id,
    bar: p.bar,
    game: p.game,
    actions: [
      ...(p.offersGoing
        ? [
            {
              kind: 'going' as const,
              label: p.issuesCode
                ? `${GOING_LABEL} e gerar seu código`
                : GOING_LABEL,
              on: true
            }
          ]
        : []),
      ...(p.friend
        ? [
            {
              kind: 'call' as const,
              friendId: p.friend.id,
              label: `Chamar ${p.friend.name}`,
              on: true
            }
          ]
        : []),
      // Aparece em Avisos 3 h antes; com push (WEB-416) avisa nessa hora.
      {
        kind: 'remind' as const,
        label: 'Me lembrar 3 h antes',
        on: p.remind
      }
    ]
  }
}

/** O "Me lembrar 3 h antes" da proposta (24d). */
const AI_REMIND_BEFORE_MINUTES = 180
/**
 * Uma mensagem do chat contada em eventos (R24): cada passo sai quando
 * acontece. As propostas viram `ai_proposal` depois de a linha do `ai_run`
 * existir, e só então saem para a tela: o "Confirmar" sempre acha a proposta.
 */
async function talk(
  ctx: FanContext,
  input: z.infer<typeof converseInput>,
  emit: Emit
) {
  const started = performance.now()
  const now = new Date()
  const userId = ctx.session.user.id
  const result = await readGate(userId, now)
  if (result.blocked) {
    emit(
      result.blocked.kind === 'limit'
        ? {
            type: 'blocked',
            reason: 'limit',
            scope: result.blocked.scope,
            resumesAt: result.blocked.resumesAt
          }
        : { type: 'blocked', reason: 'unavailable' }
    )
    return
  }

  const weights = await getAppConfig('ai.variant_weights')
  const variant = assignVariant(userId, CHAT_EXPERIMENT, weights.chat)
  const models = chatModels(variant)
  const tastes = input.useTastes ? await readTastes(ctx) : null
  const radiusKm = input.radiusKm ?? tastes?.radiusKm ?? 3
  const state: ToolState = {
    bars: new Map(),
    opened: new Map(),
    lastSearch: null,
    proposals: [],
    shown: []
  }
  const toolCtx = {
    caller: contextCaller(ctx),
    message: input.message,
    origin: input.origin,
    radiusKm,
    now,
    userId,
    day: input.day,
    placeLabel: input.placeLabel,
    emit
  }
  const quote = (list: string[]) => list.map((v) => `«${v}»`).join(', ')
  const context = [
    PROPOSAL_RULE,
    ...(input.placeLabel
      ? [
          // Texto do app dentro das aspas do prompt: sem as próprias aspas.
          `A busca parte de «${input.placeLabel.replace(/[«»]/g, '')}», raio de ${radiusKm} km.`
        ]
      : []),
    ...(input.day
      ? [
          `O torcedor escolheu o dia ${input.day === 'today' ? 'hoje' : 'amanhã'} (${dateOf(input.day, now)}): use essa data na busca, a menos que ele peça outro dia.`
        ]
      : []),
    ...(tastes && (tastes.sports.length || tastes.teams.length)
      ? [
          `Gostos do torcedor (use quando o pedido não disser outra coisa): esportes ${quote(tastes.sports) || 'nenhum'}; times ${quote(tastes.teams) || 'nenhum'}.`
        ]
      : [])
  ]

  const outcome = await runAi(
    { userId, feature: 'chat', variant, assignedModel: models[0] },
    result.gate.deps,
    async (call) => {
      const turnResult = await converse(input.message, input.history, {
        call,
        models,
        runTool: (name, args, callId) =>
          runTool(name, args, toolCtx, state, callId),
        state,
        now,
        hasOrigin: input.origin !== null,
        context,
        temperature: input.redo ? 0.7 : undefined,
        emit
      })
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
        msg: 'ai.converse.invented_bar',
        runId: outcome.runId,
        ids: reply.invented
      })
    )
  for (const p of state.proposals) {
    const [row] = await db
      .insert(aiProposal)
      .values({
        runId: outcome.runId,
        userId,
        barId: p.bar.id,
        eventId: p.game.id,
        offersGoing: p.offersGoing,
        friendId: p.friend?.id ?? null
      })
      .returning({ id: aiProposal.id })
    if (row) emit({ type: 'proposal', proposal: toProposal(row.id, p) })
  }
  emit({
    type: 'done',
    runId: outcome.runId,
    status: outcome.status,
    thoughtMs: Math.round(performance.now() - started),
    searches: reply.toolCalls.filter((n) => !PROPOSAL_NAMES.has(n)).length,
    chips: reply.search?.chips ?? [],
    sources: reply.bars.map((b) => ({
      barId: b.id,
      name: b.name,
      photoUrl: b.photo_url ?? null,
      why: state.opened.has(b.id) ? 'Página do bar · agenda' : 'Agenda do bar'
    })),
    suggestions: reply.suggestions,
    remainingToday: result.allowance.remainingToday - 1
  })
}

const CALL_FAILURES: Record<'not_friends' | 'duplicate' | 'past_game', string> =
  {
    not_friends: 'Vocês não são amigos na Onside.',
    duplicate: 'Você já chamou essa pessoa para este jogo.',
    past_game: 'Esse jogo já começou.'
  }

/**
 * A falha de uma ação para a tela: a frase de uma recusa (`TRPCError`, que já
 * é escrita para o torcedor) ou texto fixo. Mensagem interna não sai.
 */
function failed(error: unknown): ConfirmFailure {
  if (error instanceof TRPCError)
    return { ok: false, code: 'refused', reason: error.message }
  console.error(
    JSON.stringify({
      msg: 'ai.confirm.failed',
      error: error instanceof Error ? error.message : String(error)
    })
  )
  return { ok: false, code: 'failed', reason: 'Não deu certo agora.' }
}

/**
 * Bar e jogo da proposta, só com o que a tela do "Confirmar" mostra (24e).
 * Mesma regra de `pubs.getById`: bar fora do ar é "não encontrado" (salvo
 * para o dono), e o jogo só vem enquanto está no perfil.
 */
async function readProposalBar(
  barId: string,
  eventId: string,
  userId: string,
  now: Date
) {
  const found = await db.query.bar.findFirst({
    where: and(
      eq(bar.id, barId),
      or(eq(bar.isActive, true), eq(bar.userId, userId))
    ),
    columns: { name: true, neighborhood: true },
    with: {
      events: {
        where: (game) => and(eq(game.id, eventId), eventNotEndedSql(game, now)),
        columns: {
          startsAt: true,
          championship: true,
          participantFreeText: true
        },
        with: {
          participants: {
            columns: {},
            with: { team: { columns: { name: true } } },
            orderBy: byMatchOrder
          }
        }
      }
    }
  })
  if (!found)
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Bar não encontrado.' })
  return found
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

  /**
   * A conversa da Rodada 24: os eventos chegam um a um pelo
   * `httpBatchStreamLink` (`ChatEvent`, `lib/ai/events.ts`).
   */
  converse: fanProcedure.input(converseInput).mutation(async function* ({
    ctx,
    input
  }): AsyncGenerator<ChatEvent> {
    const queue = eventQueue<ChatEvent>()
    const work = talk(ctx, input, queue.push)
      .catch((error) => {
        console.error(
          JSON.stringify({
            msg: 'ai.converse.failed',
            error: error instanceof Error ? error.message : String(error)
          })
        )
        queue.push({ type: 'blocked', reason: 'unavailable' })
      })
      .finally(queue.close)
    // O app pode desconectar no meio (parar, sair da tela). No Worker, o que
    // fica fora do `waitUntil` é cancelado junto, e o modelo já cobrou: o
    // trabalho vai até o fim e grava o `ai_run`, só não tem mais quem leia.
    runInBackground(work)
    yield* queue.drain()
    await work
  }),

  /**
   * "Confirmar" de uma proposta (24d → 24e). Vale uma vez e só para quem a
   * recebeu; cada ação feita grava `ai_action`. Ação que falha não desfaz as
   * outras: a resposta diz o que deu certo.
   */
  confirm: fanProcedure
    .input(
      z.object({
        runId: z.string().uuid(),
        proposalId: z.string().uuid(),
        actions: z.object({
          going: z.boolean(),
          call: z.boolean(),
          remind: z.boolean()
        })
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id
      const now = new Date()
      const [p] = await db
        .update(aiProposal)
        .set({ usedAt: now })
        .where(
          and(
            eq(aiProposal.id, input.proposalId),
            eq(aiProposal.runId, input.runId),
            eq(aiProposal.userId, userId),
            isNull(aiProposal.usedAt)
          )
        )
        .returning()
      if (!p)
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Proposta não encontrada ou já confirmada.'
        })
      // A métrica não desfaz uma ação feita: falha ao gravar só vai ao log.
      const record = (kind: 'going' | 'call' | 'remind') =>
        db
          .insert(aiAction)
          .values({ runId: p.runId, kind, barId: p.barId })
          .catch((error) =>
            console.error(
              JSON.stringify({
                msg: 'ai.confirm.record_failed',
                kind,
                error: error instanceof Error ? error.message : String(error)
              })
            )
          )

      let going = null
      if (input.actions.going && p.offersGoing) {
        try {
          // O que a tela mostra é lido antes de marcar: depois do `set`, a
          // presença está feita e a resposta não pode virar falha.
          const b = await readProposalBar(p.barId, p.eventId, userId, now)
          const game = b.events[0]
          const marked = await attendanceRouter
            .createCaller(ctx)
            .set({ eventId: p.eventId, attending: true })
          await record('going')
          going = {
            ok: true as const,
            code: marked.code,
            eventTitle: game ? gameTitle(game) : '',
            // Os dois lados do confronto, um por linha no ticket; vazio fora
            // de confronto (o ticket mostra o título).
            participants: (game && matchSides(game)) || [],
            startsAt: game ? new Date(game.startsAt).toISOString() : '',
            barName: b.name,
            neighborhood: b.neighborhood ?? null
          }
        } catch (error) {
          going = failed(error)
        }
      }

      let call = null
      if (input.actions.call && p.friendId) {
        try {
          const sent = await createFriendCall({
            fromUserId: userId,
            toUserId: p.friendId,
            eventId: p.eventId,
            barId: p.barId
          })
          if (sent.ok) await record('call')
          call = sent.ok
            ? { ok: true as const, friendName: sent.friendName }
            : ({
                ok: false,
                code: sent.reason,
                reason: CALL_FAILURES[sent.reason]
              } satisfies ConfirmFailure)
        } catch (error) {
          call = failed(error)
        }
      }

      let remind = null
      if (input.actions.remind) {
        try {
          await recommendationsRouter.createCaller(ctx).remind({
            eventId: p.eventId,
            on: true,
            beforeMinutes: AI_REMIND_BEFORE_MINUTES
          })
          await record('remind')
          remind = { ok: true as const }
        } catch (error) {
          remind = failed(error)
        }
      }

      return { going, call, remind, at: hour(now) }
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
