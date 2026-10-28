import { db, type SQL, sql } from '@findsports_oficial/db'
import { aiRun } from '@findsports_oficial/db/schema/ai'
import { z } from 'zod'

import { adminProcedure, router } from '../index'
import { aiGatewayId } from '../lib/ai/binding'
import { type AiLimits, brasiliaWindows } from '../lib/ai/limits'
import { CHAT_MODELS, RECOMMENDER_MODELS } from '../lib/ai/models'
import {
  AI_PERIODS,
  type AiPeriod,
  brasiliaDays,
  conversionDiff,
  MIN_CONVERSATIONS,
  MIN_OUTCOMES,
  monthProjection,
  periodStart
} from '../lib/ai/report'
import { getAppConfig } from '../lib/app-config'

/*
 * A tela "IA" do Houdini: o que os testes de IA (WEB-424) gastam e rendem,
 * lido de `ai_run` e `ai_action`. Só números: o texto das conversas não é
 * guardado (a política de privacidade promete). O que muda (ligar, pesos,
 * limites) vai pelo `appConfig.set`, que valida e escreve no Grimório.
 */

/** Conversa: mensagens da mesma pessoa no mesmo braço, sem pausa maior. */
const CONVERSATION_GAP = sql`interval '30 minutes'`
/** Ação que conta como conversão: até 24 h depois da resposta. */
const CONVERSION_WINDOW = sql`interval '24 hours'`
// ponytail: gráfico e listas com teto fixo; paginar se a IA crescer.
const CHART_MAX_DAYS = 92
const TOP_LIMIT = 10

const TZ = sql`'America/Sao_Paulo'`

const since = (start: Date | null, column = sql`r.created_at`): SQL =>
  start ? sql`${column} >= ${start}` : sql`true`

type VariantRow = {
  variant: string
  people: number
  messages: number
  useful: number
  errors: number
  timeouts: number
  deviated: number
  thumbs_up: number
  thumbs_down: number
  p50: number | null
  p95: number | null
  tokens_in: number
  tokens_out: number
  cost: number
  conversations: number
  conversions: number
}

/**
 * Números de cada braço de um teste no período. Conversa abre quando a
 * mensagem anterior da pessoa no braço veio há mais de 30 minutos; converte
 * quando uma resposta dela teve ação (abrir bar, "Vou assistir", rota) em até
 * 24 h. Tempo só das que responderam (ok ou desvio).
 */
async function readVariants(
  feature: 'chat' | 'recommender',
  start: Date | null
) {
  const result = await db.execute<VariantRow>(sql`
    WITH runs AS (
      SELECT r.*,
        coalesce(r.user_id, r.run_id) AS who,
        EXISTS (
          SELECT 1 FROM ai_action a
          WHERE a.run_id = r.run_id
            AND a.created_at <= r.created_at + ${CONVERSION_WINDOW}
        ) AS acted,
        CASE WHEN r.created_at - lag(r.created_at) OVER w <= ${CONVERSATION_GAP}
          THEN 0 ELSE 1 END AS opens
      FROM ai_run r
      WHERE r.feature = ${feature} AND ${since(start)}
      WINDOW w AS (PARTITION BY r.variant, coalesce(r.user_id, r.run_id) ORDER BY r.created_at)
    ),
    numbered AS (
      SELECT *, sum(opens) OVER (
        PARTITION BY variant, who ORDER BY created_at ROWS UNBOUNDED PRECEDING
      ) AS conversation
      FROM runs
    ),
    conversations AS (
      SELECT variant, count(*)::int AS conversations,
        count(*) FILTER (WHERE converted)::int AS conversions
      FROM (
        SELECT variant, who, conversation, bool_or(acted) AS converted
        FROM numbered GROUP BY 1, 2, 3
      ) c
      GROUP BY 1
    )
    SELECT r.variant,
      count(DISTINCT r.user_id)::int AS people,
      count(*)::int AS messages,
      count(*) FILTER (WHERE r.useful)::int AS useful,
      count(*) FILTER (WHERE r.status = 'error')::int AS errors,
      count(*) FILTER (WHERE r.status = 'timeout')::int AS timeouts,
      count(*) FILTER (
        WHERE r.served_model IS NOT NULL AND r.served_model <> r.assigned_model
      )::int AS deviated,
      count(*) FILTER (WHERE r.feedback = 1)::int AS thumbs_up,
      count(*) FILTER (WHERE r.feedback = -1)::int AS thumbs_down,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY r.latency_ms)
        FILTER (WHERE r.status IN ('ok', 'fallback')) AS p50,
      percentile_cont(0.95) WITHIN GROUP (ORDER BY r.latency_ms)
        FILTER (WHERE r.status IN ('ok', 'fallback')) AS p95,
      coalesce(sum(r.tokens_in), 0)::int AS tokens_in,
      coalesce(sum(r.tokens_out), 0)::int AS tokens_out,
      coalesce(sum(r.cost_usd), 0)::float8 AS cost,
      coalesce(max(c.conversations), 0)::int AS conversations,
      coalesce(max(c.conversions), 0)::int AS conversions
    FROM runs r
    LEFT JOIN conversations c ON c.variant = r.variant
    GROUP BY r.variant
  `)
  return new Map(result.rows.map((row) => [row.variant, row]))
}

/** O braço com o que a tela mostra, zerado se não rodou no período. */
function arm(
  variant: string,
  model: string | null,
  weight: number,
  row: VariantRow | undefined
) {
  const r = row ?? null
  const messages = r?.messages ?? 0
  const useful = r?.useful ?? 0
  const conversions = r?.conversions ?? 0
  const cost = r?.cost ?? 0
  const rated = (r?.thumbs_up ?? 0) + (r?.thumbs_down ?? 0)
  const share = (n: number, of: number) => (of ? n / of : null)
  return {
    variant,
    model,
    weight,
    people: r?.people ?? 0,
    conversations: r?.conversations ?? 0,
    messages,
    useful,
    usefulRate: share(useful, messages),
    errors: r?.errors ?? 0,
    timeouts: r?.timeouts ?? 0,
    deviated: r?.deviated ?? 0,
    deviatedRate: share(r?.deviated ?? 0, messages),
    thumbsUp: r?.thumbs_up ?? 0,
    thumbsDown: r?.thumbs_down ?? 0,
    thumbsUpRate: share(r?.thumbs_up ?? 0, rated),
    conversions,
    conversionRate: share(conversions, r?.conversations ?? 0),
    p50Ms: r?.p50 ?? null,
    p95Ms: r?.p95 ?? null,
    tokensIn: r?.tokens_in ?? 0,
    tokensOut: r?.tokens_out ?? 0,
    costUsd: cost,
    costPerUseful: useful ? cost / useful : null,
    costPerConversion: conversions ? cost / conversions : null
  }
}

type LimitHits = {
  chat_day: number
  chat_month: number
  calls_day: number
  cost_month: number
}

/**
 * Quantas pessoas chegaram a cada limite no período, pelos limites de agora.
 * Os de mês olham o mês inteiro em que o período começa: chegar a 100 no mês
 * não acontece num dia só. Pedido barrado não vira linha, então isto conta
 * quem chegou ao limite, não quantas vezes bateu nele.
 */
async function readLimitHits(start: Date | null, limits: AiLimits) {
  const monthFrom = start ? brasiliaWindows(start).monthStart : null
  const result = await db.execute<LimitHits>(sql`
    WITH days AS (
      SELECT r.user_id, ((r.created_at AT TIME ZONE ${TZ})::date) AS day,
        count(*) AS calls,
        count(*) FILTER (WHERE r.feature = 'chat' AND r.useful) AS chat
      FROM ai_run r
      WHERE r.user_id IS NOT NULL AND ${since(start)}
      GROUP BY 1, 2
    ),
    months AS (
      SELECT r.user_id, date_trunc('month', r.created_at AT TIME ZONE ${TZ}) AS month,
        count(*) FILTER (WHERE r.feature = 'chat' AND r.useful) AS chat,
        sum(r.cost_usd) AS cost
      FROM ai_run r
      WHERE r.user_id IS NOT NULL AND ${since(monthFrom)}
      GROUP BY 1, 2
    )
    SELECT
      (SELECT count(DISTINCT user_id) FROM days WHERE chat >= ${limits.chatDailyMessages})::int AS chat_day,
      (SELECT count(DISTINCT user_id) FROM days WHERE calls >= ${limits.userDailyCalls})::int AS calls_day,
      (SELECT count(DISTINCT user_id) FROM months WHERE chat >= ${limits.chatMonthlyMessages})::int AS chat_month,
      (SELECT count(DISTINCT user_id) FROM months WHERE cost >= ${limits.userMonthlyUsd})::int AS cost_month
  `)
  const row = result.rows[0]
  return {
    chatDay: row?.chat_day ?? 0,
    chatMonth: row?.chat_month ?? 0,
    callsDay: row?.calls_day ?? 0,
    costMonth: row?.cost_month ?? 0
  }
}

/** Gasto e chamadas por dia de Brasília, com os dias sem chamada zerados. */
async function readDaily(start: Date | null, now: Date) {
  const result = await db.execute<{ day: string; cost: number; runs: number }>(
    sql`
      SELECT to_char((r.created_at AT TIME ZONE ${TZ})::date, 'YYYY-MM-DD') AS day,
        coalesce(sum(r.cost_usd), 0)::float8 AS cost, count(*)::int AS runs
      FROM ai_run r
      WHERE ${since(start)}
      GROUP BY 1 ORDER BY 1
    `
  )
  const byDay = new Map(result.rows.map((row) => [row.day, row]))
  const first = result.rows[0]?.day
  const from = start ?? (first ? new Date(`${first}T12:00:00-03:00`) : now)
  return brasiliaDays(from, now)
    .slice(-CHART_MAX_DAYS)
    .map((day) => ({
      day,
      costUsd: byDay.get(day)?.cost ?? 0,
      runs: byDay.get(day)?.runs ?? 0
    }))
}

type Spender = {
  user_id: string
  name: string | null
  email: string | null
  cost: number
  calls: number
  chat: number
}

/** Quem mais gastou no mês e quem mais chamou hoje (para achar abuso). */
async function readTop(now: Date) {
  const w = brasiliaWindows(now)
  const top = (from: Date, order: SQL) =>
    db.execute<Spender>(sql`
      SELECT r.user_id, u.name, u.email,
        coalesce(sum(r.cost_usd), 0)::float8 AS cost,
        count(*)::int AS calls,
        count(*) FILTER (WHERE r.feature = 'chat' AND r.useful)::int AS chat
      FROM ai_run r
      LEFT JOIN "user" u ON u.id = r.user_id
      WHERE r.user_id IS NOT NULL AND r.created_at >= ${from}
      GROUP BY r.user_id, u.name, u.email
      ORDER BY ${order}, r.user_id
      LIMIT ${TOP_LIMIT}
    `)
  const [month, today] = await Promise.all([
    top(w.monthStart, sql`cost DESC`),
    top(w.dayStart, sql`calls DESC`)
  ])
  const shape = (row: Spender) => ({
    userId: row.user_id,
    name: row.name,
    email: row.email,
    costUsd: row.cost,
    calls: row.calls,
    chat: row.chat
  })
  return { month: month.rows.map(shape), today: today.rows.map(shape) }
}

const MODELS = [
  ...new Set([
    ...Object.values(CHAT_MODELS),
    ...Object.values(RECOMMENDER_MODELS)
  ])
]

export const houdiniIaRouter = router({
  overview: adminProcedure
    .input(z.object({ period: z.enum(AI_PERIODS).default('7d') }))
    .query(async ({ input }) => {
      const now = new Date()
      const period: AiPeriod = input.period
      const start = periodStart(period, now)
      const w = brasiliaWindows(now)
      const [enabled, limits, weights] = await Promise.all([
        getAppConfig('ai.enabled'),
        getAppConfig('ai.limits'),
        getAppConfig('ai.variant_weights')
      ])
      const [
        monthResult,
        chat,
        recommender,
        recommenderEver,
        hits,
        daily,
        top
      ] = await Promise.all([
        db.execute<{ cost: number }>(sql`
          SELECT coalesce(sum(cost_usd), 0)::float8 AS cost FROM ai_run
          WHERE created_at >= ${w.monthStart} AND created_at < ${w.nextMonth}
        `),
        readVariants('chat', start),
        readVariants('recommender', start),
        db.execute<{ n: number }>(
          sql`SELECT count(*)::int AS n FROM ai_run WHERE feature = 'recommender'`
        ),
        readLimitHits(start, limits),
        readDaily(start, now),
        readTop(now)
      ])
      const monthSpent = monthResult.rows[0]?.cost ?? 0
      const chatArms = (['a', 'b'] as const).map((v) =>
        arm(v, CHAT_MODELS[v], weights.chat[v], chat.get(v))
      )
      const recArms = (['a', 'b', 'c'] as const).map((v) =>
        arm(
          v,
          v === 'a' ? null : RECOMMENDER_MODELS[v],
          weights.recommender[v],
          recommender.get(v)
        )
      )
      const [chatA, chatB] = chatArms as [
        (typeof chatArms)[number],
        (typeof chatArms)[number]
      ]
      return {
        period,
        start: start?.toISOString() ?? null,
        status: {
          enabled,
          gatewayId: aiGatewayId(),
          limits,
          month: {
            spentUsd: monthSpent,
            budgetUsd: limits.monthlyBudgetUsd,
            share: monthSpent / limits.monthlyBudgetUsd,
            projectionUsd: monthProjection(monthSpent, now),
            blocked: monthSpent >= limits.monthlyBudgetUsd
          },
          daily,
          hits
        },
        chat: {
          arms: chatArms,
          conversion: conversionDiff(chatA, chatB),
          minimum: { conversations: MIN_CONVERSATIONS, outcomes: MIN_OUTCOMES }
        },
        recommender: {
          live: (recommenderEver.rows[0]?.n ?? 0) > 0,
          arms: recArms
        },
        top: { ...top, limits }
      }
    }),

  /** As últimas execuções, sem texto de conversa (não é guardado). */
  runs: adminProcedure
    .input(
      z.object({
        feature: z.enum(['chat', 'recommender']).optional(),
        variant: z.enum(['a', 'b', 'c']).optional(),
        model: z.string().max(80).optional(),
        status: z.enum(aiRun.status.enumValues).optional(),
        limit: z.number().int().min(1).max(200).default(50)
      })
    )
    .query(async ({ input }) => {
      const where: SQL[] = [sql`true`]
      if (input.feature) where.push(sql`r.feature = ${input.feature}`)
      if (input.variant) where.push(sql`r.variant = ${input.variant}`)
      if (input.status) where.push(sql`r.status = ${input.status}`)
      if (input.model)
        where.push(
          sql`(r.assigned_model = ${input.model} OR r.served_model = ${input.model})`
        )
      const result = await db.execute<{
        run_id: string
        created_at: string
        feature: 'chat' | 'recommender'
        variant: string
        assigned_model: string
        served_model: string | null
        status: (typeof aiRun.status.enumValues)[number]
        latency_ms: number
        tokens_in: number
        tokens_out: number
        cost: number
        useful: boolean
        feedback: number | null
        actions: number
        user_id: string | null
        user_name: string | null
      }>(sql`
        SELECT r.run_id, r.created_at, r.feature, r.variant, r.assigned_model,
          r.served_model, r.status, r.latency_ms, r.tokens_in, r.tokens_out,
          r.cost_usd::float8 AS cost, r.useful, r.feedback,
          (SELECT count(*)::int FROM ai_action a WHERE a.run_id = r.run_id) AS actions,
          r.user_id, u.name AS user_name
        FROM ai_run r
        LEFT JOIN "user" u ON u.id = r.user_id
        WHERE ${sql.join(where, sql` AND `)}
        ORDER BY r.created_at DESC, r.run_id
        LIMIT ${input.limit}
      `)
      return {
        models: MODELS,
        rows: result.rows.map((r) => ({
          runId: r.run_id,
          createdAt: new Date(r.created_at).toISOString(),
          feature: r.feature,
          variant: r.variant,
          assignedModel: r.assigned_model,
          servedModel: r.served_model,
          status: r.status,
          latencyMs: r.latency_ms,
          tokensIn: r.tokens_in,
          tokensOut: r.tokens_out,
          costUsd: r.cost,
          useful: r.useful,
          feedback: r.feedback,
          actions: r.actions,
          userId: r.user_id,
          userName: r.user_name
        }))
      }
    })
})
