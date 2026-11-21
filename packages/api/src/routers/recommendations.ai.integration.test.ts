import { afterAll, beforeAll, expect, spyOn, test } from 'bun:test'
import { eq, inArray } from '@findsports_oficial/db'
import { aiRun } from '@findsports_oficial/db/schema/ai'
import { isDisposableTestDatabase } from '@findsports_oficial/db/utils/db-resolver'

import { setAiBinding } from '../lib/ai/binding'
import { RECOMMENDER_MODELS } from '../lib/ai/models'
import * as aiRunModule from '../lib/ai/run'
import {
  AFFINITY_TIMEOUT_MS,
  CONTROL_MODEL
} from '../lib/recommendations/ai-round'
import { contextFor, load } from './integration-seed'

/*
 * O teste A × C de "Bares pra você" (WEB-426, fase 2) em `recommendations.today`,
 * com o modelo dublado (`setAiBinding`): nada chama a IA de verdade. Um ponto
 * isolado no mapa e um torcedor novo por caso, porque a rodada é uma por dia.
 */

const integrationTest = isDisposableTestDatabase() ? test : test.skip
const ORIGIN = { lat: -31.9, lng: -41.9 }

type Ctx = Awaited<ReturnType<typeof seed>>
let ctx: Ctx | undefined

async function seed() {
  const { db, appRouter } = await load()
  const [authSchema, platformSchema] = await Promise.all([
    import('@findsports_oficial/db/schema/auth'),
    import('@findsports_oficial/db/schema/platform')
  ])
  const schema = { ...authSchema, ...platformSchema }
  const ownerIds = Array.from({ length: 8 }, () => crypto.randomUUID())
  const barIds = Array.from({ length: 8 }, () => crypto.randomUUID())
  const fanIds: string[] = []
  await db.insert(schema.user).values(
    ownerIds.map((id) => ({
      id,
      name: 'Dono de bar do teste A × C',
      email: `${id}@integration.invalid`,
      emailVerified: true,
      role: 'pub' as const,
      onboardingCompleted: true
    }))
  )
  await db.insert(schema.bar).values(
    barIds.map((id, index) => ({
      id,
      userId: ownerIds[index] as string,
      name: `Bar do teste A × C ${index + 1}`,
      address: `Rua do teste, ${index + 1}`,
      neighborhood: `Bairro ${index % 3}`,
      city: 'Teste',
      latitude: (ORIGIN.lat + 0.002 * (index + 1)).toFixed(8),
      longitude: ORIGIN.lng.toFixed(8),
      amenities: index % 2 ? [1, 4] : [2],
      description: index === 0 ? 'Telão e chope gelado.' : null,
      isActive: true
    }))
  )
  /** Um torcedor novo: a rodada dele ainda não existe hoje. */
  const fan = async (client: 'app' | 'web' = 'app') => {
    const id = crypto.randomUUID()
    fanIds.push(id)
    await db.insert(schema.user).values({
      id,
      name: 'Torcedor do teste A × C',
      email: `${id}@integration.invalid`,
      emailVerified: true,
      role: 'fan',
      onboardingCompleted: true,
      searchRadiusKm: 3
    })
    const caller = appRouter.createCaller({
      ...contextFor(id, 'fan'),
      headers: new Headers(client === 'app' ? { 'x-onside-client': 'app' } : {})
    } as Parameters<typeof appRouter.createCaller>[0])
    return { id, today: () => caller.recommendations.today({ where: ORIGIN }) }
  }
  const runs = (userId: string) =>
    db
      .select({
        runId: aiRun.runId,
        variant: aiRun.variant,
        assignedModel: aiRun.assignedModel,
        servedModel: aiRun.servedModel,
        status: aiRun.status,
        costUsd: aiRun.costUsd
      })
      .from(aiRun)
      .where(eq(aiRun.userId, userId))
  return {
    db,
    fan,
    runs,
    cleanup: async () => {
      if (fanIds.length)
        await db.delete(aiRun).where(inArray(aiRun.userId, fanIds))
      await db
        .delete(schema.user)
        .where(inArray(schema.user.id, [...fanIds, ...ownerIds]))
    }
  }
}

/** O modelo dublado: conta as chamadas e responde o que `answer` mandar. */
function model(answer: (input: Record<string, unknown>) => Promise<unknown>) {
  const calls: string[] = []
  setAiBinding({
    run: async (id, input) => {
      calls.push(id)
      return answer(input)
    }
  })
  return calls
}

/** Nota máxima para todo bar do pedido, com o uso para o custo. */
const allFour = async (input: Record<string, unknown>) => ({
  answers: Object.fromEntries(
    Object.keys(input.questions as object).map((key) => [key, { score: 4 }])
  ),
  usage: { input_tokens: 4750, output_tokens: 0 }
})

async function testOn(weights: { a: number; c: number }) {
  const { setAppConfig } = await import('../lib/app-config')
  await setAppConfig('ai.enabled', true, null)
  await setAppConfig('ai.recommender_enabled', true, null)
  await setAppConfig(
    'ai.variant_weights',
    { chat: { a: 50, b: 50 }, recommender: { ...weights, b: 0 } },
    null
  )
}

async function testOff() {
  const { resetAppConfig } = await import('../lib/app-config')
  await resetAppConfig('ai.enabled')
  await resetAppConfig('ai.recommender_enabled')
  await resetAppConfig('ai.variant_weights')
}

beforeAll(async () => {
  if (isDisposableTestDatabase()) ctx = await seed()
})

afterAll(async () => {
  // Sem banco descartável o seed não rodou: nada a desfazer, e o reset do
  // app_config iria a outro banco (ou falharia sem nenhum).
  if (!ctx) return
  await testOff()
  await ctx.cleanup()
})

const experience = (round: {
  items: { axes: { experienceSimilarity: number } }[]
}) => round.items.map((item) => item.axes.experienceSimilarity)

integrationTest(
  'desligado: rodada como sempre, sem ai_run nem chamada',
  async () => {
    if (!ctx) throw new Error('sem seed')
    const calls = model(allFour)
    const fan = await ctx.fan()
    const { round } = await fan.today()
    expect(round?.items).toHaveLength(5)
    expect(calls).toEqual([])
    expect(await ctx.runs(fan.id)).toEqual([])
  }
)

integrationTest(
  'ligado, pedido do web: fica no controle, sem ai_run nem chamada (só o app entra)',
  async () => {
    if (!ctx) throw new Error('sem seed')
    const calls = model(allFour)
    await testOn({ a: 0, c: 100 })
    try {
      const fan = await ctx.fan('web')
      const { round } = await fan.today()
      expect(round?.items).toHaveLength(5)
      expect(calls).toEqual([])
      expect(await ctx.runs(fan.id)).toEqual([])
    } finally {
      await testOff()
    }
  }
)

integrationTest(
  'braço A: linha de controle com o run_id da rodada, sem chamar a IA',
  async () => {
    if (!ctx) throw new Error('sem seed')
    const calls = model(allFour)
    await testOn({ a: 100, c: 0 })
    try {
      const fan = await ctx.fan()
      const { round } = await fan.today()
      expect(calls).toEqual([])
      expect(await ctx.runs(fan.id)).toEqual([
        {
          runId: round?.runId as string,
          variant: 'a',
          assignedModel: CONTROL_MODEL,
          servedModel: null,
          status: 'ok',
          costUsd: 0
        }
      ])
      // A linha sem chamada não gasta das chamadas do dia da pessoa.
      const { readUserUsage } = await import('../lib/ai/run')
      expect((await readUserUsage(fan.id)).callsToday).toBe(0)
      // A mesma rodada no resto do dia: nenhuma linha nova.
      await fan.today()
      expect(await ctx.runs(fan.id)).toHaveLength(1)
    } finally {
      await testOff()
    }
  }
)

integrationTest(
  'braço C: a afinidade do Clef-flash troca "Seu estilo", uma chamada por dia',
  async () => {
    if (!ctx) throw new Error('sem seed')
    const calls = model(allFour)
    // O mesmo ponto com o teste desligado: "Seu estilo" pela regra.
    const controlRound = (await (await ctx.fan()).today()).round
    await testOn({ a: 0, c: 100 })
    try {
      const fan = await ctx.fan()
      const { round } = await fan.today()
      expect(calls).toEqual([RECOMMENDER_MODELS.c])
      expect(experience(round as never)).toEqual([18, 18, 18, 18, 18])
      expect(experience(controlRound as never)).not.toEqual([
        18, 18, 18, 18, 18
      ])
      const [run] = await ctx.runs(fan.id)
      expect(run).toMatchObject({
        runId: round?.runId,
        variant: 'c',
        assignedModel: RECOMMENDER_MODELS.c,
        servedModel: RECOMMENDER_MODELS.c,
        status: 'ok'
      })
      expect(run?.costUsd).toBeGreaterThan(0)
      const { readUserUsage } = await import('../lib/ai/run')
      expect((await readUserUsage(fan.id)).callsToday).toBe(1)

      await fan.today()
      expect(calls).toHaveLength(1)
    } finally {
      await testOff()
    }
  }
)

integrationTest(
  'braço C com o modelo falhando: nova tentativa, depois a ordem do controle',
  async () => {
    if (!ctx) throw new Error('sem seed')
    const calls = model(async () => {
      throw new Error('3040: falha')
    })
    await testOn({ a: 0, c: 100 })
    try {
      const fan = await ctx.fan()
      const { round } = await fan.today()
      expect(calls).toEqual([RECOMMENDER_MODELS.c, RECOMMENDER_MODELS.c])
      expect(round?.items).toHaveLength(5)
      expect(experience(round as never)).not.toEqual([18, 18, 18, 18, 18])
      expect(await ctx.runs(fan.id)).toMatchObject([
        {
          runId: round?.runId,
          variant: 'c',
          servedModel: null,
          status: 'error'
        }
      ])
    } finally {
      await testOff()
    }
  }
)

integrationTest(
  'braço C acima do teto de tempo: controle, sem nova tentativa, timeout',
  async () => {
    if (!ctx) throw new Error('sem seed')
    const calls = model(
      (input) =>
        new Promise((resolve) =>
          setTimeout(() => resolve(allFour(input)), AFFINITY_TIMEOUT_MS + 500)
        )
    )
    await testOn({ a: 0, c: 100 })
    try {
      const fan = await ctx.fan()
      const { round } = await fan.today()
      expect(calls).toEqual([RECOMMENDER_MODELS.c])
      expect(experience(round as never)).not.toEqual([18, 18, 18, 18, 18])
      expect(await ctx.runs(fan.id)).toMatchObject([
        { runId: round?.runId, variant: 'c', status: 'timeout' }
      ])
    } finally {
      await testOff()
    }
  },
  // Espera o teto inteiro (2,5 s) antes de cair no controle.
  10_000
)

integrationTest(
  'braço C com o teto do mês estourado: controle sem chamar a IA',
  async () => {
    if (!ctx) throw new Error('sem seed')
    const { db } = ctx
    const calls = model(allFour)
    await testOn({ a: 0, c: 100 })
    // Gasto do mês de todo mundo acima do teto padrão (US$ 40).
    const spenderRun = crypto.randomUUID()
    await db.insert(aiRun).values({
      runId: spenderRun,
      userId: null,
      feature: 'chat',
      variant: 'a',
      assignedModel: 'teste',
      status: 'ok',
      costUsd: 1000
    })
    try {
      const fan = await ctx.fan()
      const { round } = await fan.today()
      expect(calls).toEqual([])
      expect(round?.items).toHaveLength(5)
      expect(await ctx.runs(fan.id)).toMatchObject([
        { runId: round?.runId, variant: 'c', status: 'error', costUsd: 0 }
      ])
    } finally {
      await db.delete(aiRun).where(eq(aiRun.runId, spenderRun))
      await testOff()
    }
  }
)

integrationTest(
  'braço C com a reserva recusada depois do gate: controle sem chamar a IA',
  async () => {
    if (!ctx) throw new Error('sem seed')
    const { db } = ctx
    const calls = model(allFour)
    await testOn({ a: 0, c: 100 })
    // O gate leu o uso antes de outra execução gastar o resto: ele deixa
    // passar, e a reserva, que relê o uso com a trava, recusa.
    const real = await aiRunModule.aiGate(crypto.randomUUID())
    if (!real.ok) throw new Error('gate fechado antes do teste')
    const gate = spyOn(aiRunModule, 'aiGate').mockResolvedValue(real)
    const spenderRun = crypto.randomUUID()
    await db.insert(aiRun).values({
      runId: spenderRun,
      userId: null,
      feature: 'chat',
      variant: 'a',
      assignedModel: 'teste',
      status: 'ok',
      costUsd: 1000
    })
    try {
      const fan = await ctx.fan()
      const { round } = await fan.today()
      expect(gate).toHaveBeenCalled()
      expect(calls).toEqual([])
      expect(round?.items).toHaveLength(5)
      expect(await ctx.runs(fan.id)).toMatchObject([
        { runId: round?.runId, variant: 'c', status: 'error', costUsd: 0 }
      ])
    } finally {
      gate.mockRestore()
      await db.delete(aiRun).where(eq(aiRun.runId, spenderRun))
      await testOff()
    }
  }
)
