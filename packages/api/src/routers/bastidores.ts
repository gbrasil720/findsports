import { db, eq, sql } from '@findsports_oficial/db'
import { recordAdminAction } from '@findsports_oficial/db/admin-action'
import journal from '@findsports_oficial/db/migrations/meta/_journal.json'
import { jobRun } from '@findsports_oficial/db/schema/houdini'
import { z } from 'zod'

import { adminProcedure, router } from '../index'
import { getDeployVersion } from '../lib/deploy-version'
import {
  type Health,
  JOB_NAMES,
  jobHealth,
  nextScheduledRun,
  runJob
} from '../lib/jobs'

/**
 * TileJSON do basemap: pequeno e servido pelo Worker `onside-tiles`, então
 * responder prova que o Worker e o R2 estão de pé. É o tileset de
 * `docs/map-tiles.md`; rebuild do archive troca aqui também.
 */
const TILESET = 'onside-br-20260906'
const TILEJSON_URL = `https://tiles.onside.sh/${TILESET}.json`

function message(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

async function lastRun(job: (typeof JOB_NAMES)[number]) {
  const [row] = await db
    .select()
    .from(jobRun)
    .where(eq(jobRun.job, job))
    .orderBy(sql`${jobRun.startedAt} DESC`)
    .limit(1)
  return row ?? null
}

/**
 * Último arquivo aplicado × último do journal que veio no código no ar. Conta,
 * e não compara nome: é a quantidade que diz se falta aplicar algo. A tag da
 * última aplicada sai do `created_at`, que o Drizzle grava com o `when` do
 * journal.
 */
async function migrations() {
  const result = await db.execute(sql`
    SELECT count(*)::int AS n, max(created_at)::text AS last
    FROM drizzle.__drizzle_migrations
  `)
  const row = result.rows[0] as { n: number; last: string | null }
  const entries = journal.entries
  return {
    state: (row.n < entries.length ? 'bad' : 'ok') as Health,
    applied: row.n,
    appliedTag:
      entries.find((e) => String(e.when) === row.last)?.tag ?? row.last,
    files: entries.length,
    lastFile: entries.at(-1)?.tag ?? null
  }
}

async function database() {
  const started = performance.now()
  await db.execute(sql`SELECT 1`)
  return {
    state: 'ok' as Health,
    latencyMs: Math.round(performance.now() - started)
  }
}

async function tiles() {
  const started = performance.now()
  const response = await fetch(TILEJSON_URL, {
    signal: AbortSignal.timeout(3000)
  })
  await response.body?.cancel()
  return {
    state: (response.ok ? 'ok' : 'bad') as Health,
    status: response.status,
    latencyMs: Math.round(performance.now() - started),
    tileset: TILESET
  }
}

/** Cada verificação cai sozinha: a falha de uma vira o cartão "falhou". */
async function check<T>(fn: () => Promise<T>) {
  try {
    return await fn()
  } catch (error) {
    return { state: 'bad' as Health, error: message(error) }
  }
}

/**
 * WEB-389: o que roda sem ninguém ver. Só leitura, menos o "Rodar agora",
 * que passa pelo mesmo caminho do cron e fica no Grimório.
 */
export const bastidoresRouter = router({
  status: adminProcedure.query(async () => {
    const now = new Date()
    const nextRunAt = nextScheduledRun(now)
    const [runs, migrationsCheck, databaseCheck, tilesCheck] =
      await Promise.all([
        Promise.all(
          JOB_NAMES.map(async (job) => {
            const run = await lastRun(job)
            return { job, lastRun: run, nextRunAt, state: jobHealth(run, now) }
          })
        ),
        check(migrations),
        check(database),
        check(tiles)
      ])
    return {
      checkedAt: now,
      jobs: runs,
      migrations: migrationsCheck,
      database: databaseCheck,
      tiles: tilesCheck,
      deploy: getDeployVersion()
    }
  }),

  run: adminProcedure
    .input(z.object({ job: z.enum(JOB_NAMES) }))
    .mutation(async ({ ctx, input }) => {
      // A rotina não roda em transação: o Grimório anota no `finally`, com
      // sucesso ou falha, e o detalhe do resultado fica em `job_run`.
      let ok = false
      try {
        const result = await runJob(input.job, 'houdini')
        ok = true
        return { job: input.job, result }
      } finally {
        await recordAdminAction({
          kind: 'system.run_job',
          actorId: ctx.session.user.id,
          actorName: ctx.session.user.name,
          targetType: 'job',
          targetId: input.job,
          targetLabel: input.job,
          detail: { ok }
        })
      }
    })
})
