import { db, eq, sql } from '@findsports_oficial/db'
import { jobRun } from '@findsports_oficial/db/schema/houdini'

import { closeStaleRuns } from './ai/stale-runs'
import { reconcileBarPlans } from './bar-plan-sync'
import { runScheduledAnalyticsRetention } from './commercial-analytics/retention'

/**
 * As rotinas do cron diário (WEB-389). O Bastidores do Houdini lê o rastro
 * delas em `job_run` e roda qualquer uma na hora pelo mesmo caminho.
 */
export const JOB_NAMES = [
  'bar_plans',
  'analytics_retention',
  'ai_stale_runs',
  'bar_notices'
] as const
export type JobName = (typeof JOB_NAMES)[number]
export type JobTrigger = 'cron' | 'houdini'

const JOBS: Record<JobName, (trigger: JobTrigger) => Promise<unknown>> = {
  bar_plans: () => reconcileBarPlans(),
  // `analytics_retention_run` tem o próprio registro, que chama de `admin`
  // quem não é o cron.
  analytics_retention: (trigger) =>
    runScheduledAnalyticsRetention(trigger === 'cron' ? 'cron' : 'admin'),
  // Resumo da semana e grade vazia por e-mail (WEB-441). Roda todo dia e só
  // manda às segundas, depois dos planos: o resumo lê `bar.plan` em dia.
  // Importado aqui dentro: o `worker.ts` carrega este arquivo na subida, e
  // `bar-notices` puxa `env/server`, que valida as variáveis ao ser
  // importado. No Worker elas não existem nesse momento, e ele não sobe.
  // Execução da IA presa em `running` (WEB-430).
  ai_stale_runs: () => closeStaleRuns(),
  bar_notices: async () =>
    (await import('./bar-notices')).sendWeeklyBarNotices()
}

/**
 * Roda `fn` e grava a execução, com sucesso ou falha. A falha é relançada:
 * o cron precisa dela para marcar a invocação como falha. Se o próprio
 * registro da falha falhar, vai ao log e o erro original segue.
 */
export async function recordJobRun<T>(
  job: JobName,
  trigger: JobTrigger,
  fn: () => Promise<T>
): Promise<T> {
  const startedAt = new Date()
  let result: T
  try {
    result = await fn()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await db
      .insert(jobRun)
      .values({ job, trigger, startedAt, ok: false, error: message })
      .catch((recordError: unknown) =>
        console.error(
          JSON.stringify({
            evt: 'job_run_record_failed',
            job,
            message:
              recordError instanceof Error
                ? recordError.message
                : String(recordError)
          })
        )
      )
    throw error
  }
  await db
    .insert(jobRun)
    .values({ job, trigger, startedAt, ok: true, result: result ?? null })
  return result
}

export function runJob(job: JobName, trigger: JobTrigger) {
  return recordJobRun(job, trigger, () => JOBS[job](trigger))
}

/**
 * O que o `scheduled()` do Worker roda. Os `finally` garantem que uma falha
 * numa rotina não pule as seguintes, e a falha ainda marca a invocação.
 */
export async function runScheduledJobs() {
  try {
    await runJob('bar_plans', 'cron')
  } finally {
    try {
      await runJob('analytics_retention', 'cron')
    } finally {
      try {
        await runJob('ai_stale_runs', 'cron')
      } finally {
        await runJob('bar_notices', 'cron')
      }
    }
  }
}

export type Health = 'ok' | 'warn' | 'bad'

/** A execução mais recente de uma rotina, ou nada se ela nunca rodou. */
export async function lastJobRun(job: JobName) {
  const [row] = await db
    .select()
    .from(jobRun)
    .where(eq(jobRun.job, job))
    .orderBy(sql`${jobRun.startedAt} DESC`)
    .limit(1)
  return row ?? null
}

/** Um dia e duas horas de folga: o cron atrasado não acende o alerta. */
const STALE_AFTER_MS = 26 * 60 * 60 * 1000

/**
 * Situação de uma rotina no Bastidores: última execução com erro = falhou;
 * nenhuma execução nas últimas 26 h (ou nunca) = atenção; senão, em ordem.
 */
export function jobHealth(
  lastRun: { ok: boolean; startedAt: Date } | null,
  now = new Date()
): Health {
  if (lastRun && !lastRun.ok) return 'bad'
  if (!lastRun || now.getTime() - lastRun.startedAt.getTime() > STALE_AFTER_MS)
    return 'warn'
  return 'ok'
}

/**
 * Próxima execução do cron `0 4 * * *` do wrangler.jsonc: 04:00 UTC, que é
 * 01:00 em São Paulo.
 */
export function nextScheduledRun(now = new Date()) {
  const next = new Date(now)
  next.setUTCHours(4, 0, 0, 0)
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1)
  return next
}
