import { and, db, eq, lte, sql } from '@findsports_oficial/db'
import { aiRun } from '@findsports_oficial/db/schema/ai'

/**
 * Linha `running` de mais de uma hora não termina mais: o Worker morreu no
 * meio da resposta e o `write` do fim (`runAi`) não rodou. A rotina diária
 * (`ai_stale_runs`, em `lib/jobs.ts`) a fecha como `error`, não útil (não
 * desconta do limite), com o gasto que ficou: zero, já que o custo só é
 * gravado no fim. Uma resposta leva segundos; a hora é folga.
 *
 * Arquivo à parte de `run.ts` porque o `worker.ts` carrega `lib/jobs.ts`, e
 * `run.ts` puxa a configuração da IA.
 */
export async function closeStaleRuns() {
  const rows = await db
    .update(aiRun)
    .set({ status: 'error', useful: false })
    .where(
      and(
        eq(aiRun.status, 'running'),
        lte(aiRun.createdAt, sql`now() - interval '1 hour'`)
      )
    )
    .returning({ runId: aiRun.runId })
  return { closed: rows.length }
}
