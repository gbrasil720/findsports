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
 * O mesmo relógio tira do ar o bar cujo teste grátis do cadastro venceu sem
 * contratação (WEB-357): `trialing`, sem assinatura no Stripe, com o período
 * vencido ou sem data. Só desliga: quem religa é `applyStripeSubscription`,
 * quando o dono contrata. `past_due` é de quem já assina e segue no ar, com
 * os recursos do Starter. O atraso é o mesmo da projeção, até 24 horas.
 *
 * Devolve quantos bares mudaram de plano. De quebra conserta qualquer
 * dessincronia da projeção.
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
  // `current_period_end` é `timestamp` sem fuso, lido como UTC: a mesma
  // comparação de `subscription_current_plan`.
  const expired = await db.execute(sql`
    UPDATE bar b
    SET is_active = false
    FROM subscription s
    WHERE s.bar_id = b.id
      AND b.is_active
      AND s.status = 'trialing'
      AND s.external_subscription_id IS NULL
      AND (
        s.current_period_end IS NULL
        OR s.current_period_end <= (now() AT TIME ZONE 'UTC')
      )
    RETURNING b.id
  `)
  const updated = result.rows.length
  console.log(
    JSON.stringify({
      evt: 'bar_plan_reconcile',
      ok: true,
      updated,
      offAir: expired.rows.length
    })
  )
  return updated
}
