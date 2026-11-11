import { expect, test } from 'bun:test'
import { inArray, sql } from '@findsports_oficial/db'
import { aiAction, aiRun } from '@findsports_oficial/db/schema/ai'
import { user } from '@findsports_oficial/db/schema/auth'
import { isDisposableTestDatabase } from '@findsports_oficial/db/utils/db-resolver'
import { brasiliaWindows } from '../lib/ai/limits'
import { CHAT_MODELS } from '../lib/ai/models'
import { contextFor, load, refusal } from './integration-seed'

/**
 * Tela "IA" do Houdini: números conferidos com execuções semeadas. Os totais
 * são de todo o `ai_run`, então cada teste começa com a tabela vazia (banco
 * descartável; os arquivos de teste rodam um depois do outro).
 */
const integrationTest = isDisposableTestDatabase() ? test : test.skip

const MIN = 60_000
const ago = (ms: number) => new Date(Date.now() - ms)
const later = (date: Date, ms: number) => new Date(date.getTime() + ms)

/**
 * Minutos desde o começo da sequência de hoje: 45 min atrás, ou a
 * meia-noite de Brasília se ela veio depois (o teste roda a qualquer hora e
 * tudo precisa cair no mesmo dia).
 */
function today() {
  const base = Math.max(
    Date.now() - 45 * MIN,
    brasiliaWindows(new Date()).dayStart.getTime() + 1000
  )
  return (minutes: number) => new Date(base + minutes * MIN)
}

type Run = typeof aiRun.$inferInsert

async function seedUsers(n: number) {
  const { db } = await load()
  const ids = Array.from({ length: n }, () => crypto.randomUUID())
  await db.insert(user).values(
    ids.map((id, i) => ({
      id,
      name: `Torcedor IA ${i + 1}`,
      email: `${id}@integration.invalid`,
      emailVerified: true,
      role: 'fan' as const,
      onboardingCompleted: true
    }))
  )
  return {
    ids,
    cleanup: async () => {
      await db.delete(aiRun)
      await db.delete(user).where(inArray(user.id, ids))
    }
  }
}

const chatRun = (over: Partial<Run> & Pick<Run, 'userId' | 'variant'>) => {
  const assigned = CHAT_MODELS[over.variant as 'a' | 'b']
  return {
    feature: 'chat' as const,
    assignedModel: assigned,
    servedModel: assigned,
    status: 'ok' as const,
    useful: true,
    ...over
  }
}

integrationTest('só admin com 2FA vê a tela IA', async () => {
  const { appRouter } = await load()
  const fan = appRouter.createCaller(contextFor(crypto.randomUUID(), 'fan'))
  expect((await refusal(fan.houdini.ia.overview({ period: '7d' }))).code).toBe(
    'FORBIDDEN'
  )
  expect((await refusal(fan.houdini.ia.runs({}))).code).toBe('FORBIDDEN')
  const noTwoFactor = contextFor(crypto.randomUUID(), 'admin')
  noTwoFactor.session.user.twoFactorEnabled = false
  expect(
    (
      await refusal(
        appRouter.createCaller(noTwoFactor).houdini.ia.overview({
          period: '7d'
        })
      )
    ).code
  ).toBe('FORBIDDEN')
})

integrationTest(
  'braços do chat: conversa, conversão em 24 h, desvio, p50/p95, custo e limites',
  async () => {
    const { db, appRouter } = await load()
    const { setAppConfig, resetAppConfig, validateAppConfigValue } =
      await import('../lib/app-config')
    await db.delete(aiRun)
    const users = await seedUsers(4)
    const [u1, u2, u3, u4] = users.ids as [string, string, string, string]
    const admin = appRouter.createCaller(
      contextFor(crypto.randomUUID(), 'admin')
    )

    // A (Gemini). u1: duas mensagens seguidas (uma conversa, com ação em
    // 1 h) e, 33 min depois, uma terceira que falhou (outra conversa).
    // u2, há dois dias: respondeu pelo outro modelo, ação só depois de 25 h.
    const at = today()
    const r2 = at(5)
    const r4 = ago(2 * 24 * 60 * MIN)
    // B (Luna). u3: duas mensagens, ação de rota em 10 min; u4: demora.
    const r5 = at(10)
    const rows = [
      chatRun({
        userId: u1,
        variant: 'a',
        createdAt: at(0),
        latencyMs: 100,
        tokensIn: 100,
        tokensOut: 10,
        costUsd: 0.05,
        feedback: 1
      }),
      chatRun({
        userId: u1,
        variant: 'a',
        createdAt: r2,
        latencyMs: 200,
        tokensIn: 100,
        tokensOut: 10,
        costUsd: 0.05
      }),
      chatRun({
        userId: u1,
        variant: 'a',
        createdAt: at(38),
        status: 'error',
        servedModel: null,
        useful: false,
        latencyMs: 5000
      }),
      chatRun({
        userId: u2,
        variant: 'a',
        createdAt: r4,
        status: 'fallback',
        servedModel: CHAT_MODELS.b,
        latencyMs: 300,
        tokensIn: 200,
        tokensOut: 20,
        costUsd: 0.1,
        feedback: -1
      }),
      chatRun({
        userId: u3,
        variant: 'b',
        createdAt: r5,
        latencyMs: 400,
        costUsd: 0.005
      }),
      chatRun({
        userId: u3,
        variant: 'b',
        createdAt: at(15),
        latencyMs: 600,
        costUsd: 0.005
      }),
      chatRun({
        userId: u4,
        variant: 'b',
        createdAt: at(20),
        status: 'timeout',
        servedModel: null,
        useful: false,
        latencyMs: 15000
      })
    ]
    const inserted = await db
      .insert(aiRun)
      .values(rows)
      .returning({ runId: aiRun.runId, createdAt: aiRun.createdAt })
    const idAt = (at: Date) =>
      inserted.find((r) => r.createdAt.getTime() === at.getTime())
        ?.runId as string
    await db.insert(aiAction).values([
      { runId: idAt(r2), kind: 'open_bar', createdAt: later(r2, 60 * MIN) },
      { runId: idAt(r4), kind: 'going', createdAt: later(r4, 25 * 60 * MIN) },
      { runId: idAt(r5), kind: 'route', createdAt: later(r5, 10 * MIN) }
    ])
    // Limites do app_config valem na tela (e no servidor): baixos de
    // propósito para alguém chegar a cada um.
    const limits = validateAppConfigValue('ai.limits', {
      monthlyBudgetUsd: 40,
      userMonthlyUsd: 0.1,
      userDailyCalls: 3,
      chatDailyMessages: 1,
      chatMonthlyMessages: 2
    })
    if (!limits.ok) throw new Error(limits.erro)
    await setAppConfig('ai.limits', limits.value, null)

    try {
      const o = await admin.houdini.ia.overview({ period: '7d' })
      const [a, b] = o.chat.arms
      expect(a).toMatchObject({
        variant: 'a',
        model: CHAT_MODELS.a,
        weight: 50,
        people: 2,
        conversations: 3,
        messages: 4,
        useful: 3,
        usefulRate: 0.75,
        errors: 1,
        timeouts: 0,
        deviated: 1,
        deviatedRate: 0.25,
        thumbsUp: 1,
        thumbsDown: 1,
        thumbsUpRate: 0.5,
        conversions: 1,
        p50Ms: 200,
        tokensIn: 400,
        tokensOut: 40
      })
      expect(a?.conversionRate).toBeCloseTo(1 / 3, 10)
      // percentile_cont em [100, 200, 300]: 200 + 0,9 × 100.
      expect(a?.p95Ms).toBeCloseTo(290, 6)
      expect(a?.costUsd).toBeCloseTo(0.2, 10)
      expect(a?.costPerUseful).toBeCloseTo(0.2 / 3, 10)
      expect(a?.costPerConversion).toBeCloseTo(0.2, 10)

      expect(b).toMatchObject({
        variant: 'b',
        model: CHAT_MODELS.b,
        people: 2,
        conversations: 2,
        messages: 3,
        useful: 2,
        timeouts: 1,
        deviated: 0,
        conversions: 1,
        conversionRate: 0.5,
        p50Ms: 500,
        thumbsUpRate: null
      })
      expect(b?.p95Ms).toBeCloseTo(590, 6)
      expect(b?.costPerConversion).toBeCloseTo(0.01, 10)
      expect(o.chat.conversion).toEqual({
        enough: false,
        missing: 'A tem 3 de 100 conversas'
      })

      // Recomendador nunca rodou: a tela mostra "ainda não ligado".
      expect(o.recommender.live).toBe(false)
      expect(o.recommender.arms.map((r) => r.weight)).toEqual([34, 33, 33])

      expect(o.status.limits.chatDailyMessages).toBe(1)
      expect(o.status.hits).toEqual({
        chatDay: 3,
        chatMonth: 2,
        callsDay: 1,
        costMonth: 2
      })
      expect(o.status.month.budgetUsd).toBe(40)
      expect(o.status.month.spentUsd).toBeGreaterThanOrEqual(0.11)
      expect(o.status.daily).toHaveLength(7)
      expect(o.status.daily.reduce((sum, d) => sum + d.costUsd, 0)).toBeCloseTo(
        0.21,
        10
      )
      expect(o.status.daily.reduce((sum, d) => sum + d.runs, 0)).toBe(7)

      expect(o.top.today[0]).toMatchObject({ userId: u1, calls: 3, chat: 2 })
      expect(o.top.month.find((t) => t.userId === u1)).toMatchObject({
        costUsd: 0.1,
        calls: 3
      })

      // Em 30 dias entra tudo; hoje, a mensagem de dois dias atrás sai.
      const month = await admin.houdini.ia.overview({ period: '30d' })
      expect(month.chat.arms[0]?.messages).toBe(4)
      expect(month.status.daily).toHaveLength(30)

      // Registro: filtros por braço, situação e modelo (o servido conta).
      const all = await admin.houdini.ia.runs({})
      expect(all.rows).toHaveLength(7)
      expect(all.rows[0]?.userName).toBe('Torcedor IA 1')
      expect(all.rows.find((r) => r.runId === idAt(r2))?.actions).toBe(1)
      const errors = await admin.houdini.ia.runs({ status: 'error' })
      expect(errors.rows.map((r) => r.userId)).toEqual([u1])
      const luna = await admin.houdini.ia.runs({ model: CHAT_MODELS.b })
      expect(luna.rows).toHaveLength(4)
      const armB = await admin.houdini.ia.runs({ variant: 'b', limit: 2 })
      expect(armB.rows.map((r) => r.variant)).toEqual(['b', 'b'])
      // Nenhum campo de texto da conversa sai daqui.
      expect(Object.keys(all.rows[0] ?? {})).not.toContain('text')
    } finally {
      await resetAppConfig('ai.limits')
      await users.cleanup()
    }
  }
)

integrationTest(
  'com amostra suficiente, diferença de conversão B − A com intervalo de 95%',
  async () => {
    const { db, appRouter } = await load()
    await db.delete(aiRun)
    const users = await seedUsers(2)
    const [ua, ub] = users.ids as [string, string]
    const admin = appRouter.createCaller(
      contextFor(crypto.randomUUID(), 'admin')
    )
    // 150 conversas por braço (uma mensagem a cada 31 min, na mesma
    // pessoa): A converte 30, B converte 60.
    const spaced = (userId: string, variant: 'a' | 'b') =>
      Array.from({ length: 150 }, (_, i) =>
        chatRun({ userId, variant, createdAt: ago((i + 1) * 31 * MIN) })
      )
    const inserted = await db
      .insert(aiRun)
      .values([...spaced(ua, 'a'), ...spaced(ub, 'b')])
      .returning({ runId: aiRun.runId, variant: aiRun.variant })
    const acted = [
      ...inserted.filter((r) => r.variant === 'a').slice(0, 30),
      ...inserted.filter((r) => r.variant === 'b').slice(0, 60)
    ]
    await db
      .insert(aiAction)
      .values(acted.map((r) => ({ runId: r.runId, kind: 'open_bar' as const })))
    // A ação nasce agora: antecipa para 1 min depois da resposta.
    await db.execute(sql`
      UPDATE ai_action a SET created_at = r.created_at + interval '1 minute'
      FROM ai_run r WHERE r.run_id = a.run_id
    `)

    try {
      const o = await admin.houdini.ia.overview({ period: '7d' })
      expect(o.chat.arms.map((a) => [a.conversations, a.conversions])).toEqual([
        [150, 30],
        [150, 60]
      ])
      const se = Math.sqrt((0.2 * 0.8) / 150 + (0.4 * 0.6) / 150)
      const c = o.chat.conversion
      if (!c.enough) throw new Error(c.missing)
      expect(c.diff).toBeCloseTo(0.2, 10)
      expect(c.low).toBeCloseTo(0.2 - 1.96 * se, 10)
      expect(c.high).toBeCloseTo(0.2 + 1.96 * se, 10)
      expect(c.significant).toBe(true)
      // Sem custo semeado: o custo por conversão é zero, não vazio.
      expect(o.chat.arms[1]?.costPerConversion).toBe(0)
    } finally {
      await users.cleanup()
    }
  }
)
