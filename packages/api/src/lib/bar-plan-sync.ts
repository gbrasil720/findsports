import { db, sql } from '@findsports_oficial/db'

/**
 * Reaplica em `bar.plan` o plano vigente de cada assinatura (WEB-129).
 *
 * A trigger `subscription_bar_plan_sync` cobre toda escrita em
 * `subscription`. O que ela não vê é o trial que vence sem ninguém escrever
 * na linha: a vigência depende do relógio. Esta reconciliação roda no cron
 * diário do Worker e usa a mesma função do banco que a trigger
 * (`subscription_current_plan`, migration 0050).
 *
 * Consequência: um trial vencido segue na camada do plano na busca até a
 * próxima execução, no máximo 24 horas. Recurso pago não espera por isso,
 * decide na hora por `getCurrentPlan`.
 *
 * Devolve quantos bares mudaram. De quebra conserta qualquer dessincronia
 * da projeção.
 */
export async function reconcileBarPlans(): Promise<number> {
  const result = await db.execute(sql`
    UPDATE bar b
    SET plan = subscription_current_plan(s.plan, s.status, s.current_period_end)
    FROM subscription s
    WHERE s.bar_id = b.id
      AND b.plan IS DISTINCT FROM
        subscription_current_plan(s.plan, s.status, s.current_period_end)
    RETURNING b.id
  `)
  const updated = result.rows.length
  console.log(JSON.stringify({ evt: 'bar_plan_reconcile', ok: true, updated }))
  return updated
}
