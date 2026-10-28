import { expect, test } from 'bun:test'
import { and, eq, gte, inArray } from '@findsports_oficial/db'
import { aiRun } from '@findsports_oficial/db/schema/ai'
import { user } from '@findsports_oficial/db/schema/auth'
import { jobRun } from '@findsports_oficial/db/schema/houdini'
import { isDisposableTestDatabase } from '@findsports_oficial/db/utils/db-resolver'
import { load } from '../../routers/integration-seed'

/**
 * Execução da IA presa em `running` (WEB-430): o Worker morreu no meio da
 * resposta. A rotina diária fecha a de mais de uma hora como `error`.
 */
const integrationTest = isDisposableTestDatabase() ? test : test.skip

const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000)

integrationTest(
  'a rotina diária fecha a execução presa há mais de uma hora',
  async () => {
    const { db } = await load()
    const { runJob } = await import('../jobs')
    const userId = crypto.randomUUID()
    const desde = new Date()
    await db.insert(user).values({
      id: userId,
      name: 'Torcedor IA',
      email: `${userId}@integration.invalid`,
      emailVerified: true,
      role: 'fan',
      onboardingCompleted: true
    })
    const run = (status: 'running' | 'ok', createdAt: Date) => ({
      runId: crypto.randomUUID(),
      userId,
      feature: 'chat' as const,
      variant: 'a',
      assignedModel: 'modelo',
      status,
      useful: status === 'ok',
      createdAt
    })
    const presa = run('running', ago(61))
    const rodando = run('running', ago(5))
    const pronta = run('ok', ago(120))

    try {
      await db.insert(aiRun).values([presa, rodando, pronta])

      // Outra linha presa no banco de teste também conta.
      const { closed } = (await runJob('ai_stale_runs', 'cron')) as {
        closed: number
      }
      expect(closed).toBeGreaterThanOrEqual(1)

      const rows = await db
        .select({
          runId: aiRun.runId,
          status: aiRun.status,
          useful: aiRun.useful
        })
        .from(aiRun)
        .where(eq(aiRun.userId, userId))
      const byId = new Map(rows.map((r) => [r.runId, r]))
      expect(byId.get(presa.runId)).toMatchObject({
        status: 'error',
        useful: false
      })
      // A que começou há pouco ainda pode terminar.
      expect(byId.get(rodando.runId)?.status).toBe('running')
      expect(byId.get(pronta.runId)).toMatchObject({
        status: 'ok',
        useful: true
      })

      const [trace] = await db
        .select()
        .from(jobRun)
        .where(
          and(eq(jobRun.job, 'ai_stale_runs'), gte(jobRun.startedAt, desde))
        )
      expect(trace).toMatchObject({ ok: true, result: { closed } })
    } finally {
      await db.delete(jobRun).where(gte(jobRun.startedAt, desde))
      await db.delete(user).where(inArray(user.id, [userId]))
    }
  }
)
