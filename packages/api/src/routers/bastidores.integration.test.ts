import { expect, test } from 'bun:test'
import { and, eq, gte } from '@findsports_oficial/db'
import { jobRun } from '@findsports_oficial/db/schema/houdini'
import { isDisposableTestDatabase } from '@findsports_oficial/db/utils/db-resolver'
import { contextFor, load } from './integration-seed'

/**
 * Bastidores (WEB-389): toda execução de rotina deixa linha em `job_run`, com
 * sucesso ou erro, e o "Rodar agora" fica no Grimório.
 */

const integrationTest = isDisposableTestDatabase() ? test : test.skip

integrationTest('registra a execução com sucesso e com erro', async () => {
  const { db } = await load()
  const { recordJobRun } = await import('../lib/jobs')
  const desde = new Date()

  try {
    expect(
      await recordJobRun('bar_plans', 'cron', async () => ({ updated: 2 }))
    ).toEqual({ updated: 2 })
    await expect(
      recordJobRun('bar_plans', 'cron', async () => {
        throw new Error('banco caiu')
      })
    ).rejects.toThrow('banco caiu')

    const rows = await db
      .select()
      .from(jobRun)
      .where(and(eq(jobRun.job, 'bar_plans'), gte(jobRun.startedAt, desde)))
      .orderBy(jobRun.startedAt)
    expect(rows).toMatchObject([
      { trigger: 'cron', ok: true, result: { updated: 2 }, error: null },
      { trigger: 'cron', ok: false, result: null, error: 'banco caiu' }
    ])

    // A última execução com erro deixa o cartão em "falhou".
    const { appRouter } = await load()
    const caller = appRouter.createCaller(
      contextFor(crypto.randomUUID(), 'admin')
    )
    const status = await caller.bastidores.status()
    expect(status.jobs.find((j) => j.job === 'bar_plans')).toMatchObject({
      state: 'bad',
      lastRun: { ok: false, error: 'banco caiu' }
    })
    expect(status.migrations).toMatchObject({ state: 'ok' })
    expect(status.database).toMatchObject({ state: 'ok' })
    expect(status.deploy).toBeNull()
  } finally {
    await db.delete(jobRun).where(gte(jobRun.startedAt, desde))
  }
})

integrationTest(
  'run roda a rotina pelo caminho do cron e grava no Grimório',
  async () => {
    const { db, appRouter } = await load()
    const adminId = crypto.randomUUID()
    const caller = appRouter.createCaller(contextFor(adminId, 'admin'))
    const desde = new Date()

    try {
      const { result } = await caller.bastidores.run({ job: 'bar_plans' })
      expect(result).toMatchObject({
        updated: expect.any(Number),
        offAir: expect.any(Number)
      })

      const [row] = await db
        .select()
        .from(jobRun)
        .where(and(eq(jobRun.job, 'bar_plans'), gte(jobRun.startedAt, desde)))
      expect(row).toMatchObject({ trigger: 'houdini', ok: true, result })

      const { entries } = await caller.grimorio.list({
        targetType: 'job',
        targetId: 'bar_plans',
        limit: 5
      })
      expect(entries.find((e) => e.actorId === adminId)).toMatchObject({
        kind: 'system.run_job',
        actorName: 'Conta admin',
        detail: { ok: true }
      })
    } finally {
      await db.delete(jobRun).where(gte(jobRun.startedAt, desde))
    }
  }
)

integrationTest('bastidores é só de admin', async () => {
  const { appRouter } = await load()
  const caller = appRouter.createCaller(contextFor(crypto.randomUUID(), 'pub'))
  await expect(caller.bastidores.status()).rejects.toThrow()
  await expect(caller.bastidores.run({ job: 'bar_plans' })).rejects.toThrow()
})
