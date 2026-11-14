import { db, sql } from '@findsports_oficial/db'
import {
  brasiliaDaySql,
  brasiliaTodaySql
} from '@findsports_oficial/db/event-window-sql'
import { attendance } from '@findsports_oficial/db/schema/attendance'
import { event } from '@findsports_oficial/db/schema/platform'
import {
  reservation,
  reservationCode,
  reservationCodeUse
} from '@findsports_oficial/db/schema/reservation'

/*
 * O que o plano fez pelo bar no mês (app, rodada 10, "Plano e cobrança"):
 * quantas pessoas marcaram presença nos jogos do mês de Brasília e quantos
 * códigos foram validados no balcão. Só números, sem nomes: no Pro é o "No
 * Elite, este mês você teria visto" (decisão do dono, 09/11/2026). Quem vê
 * cada número é `applyMonthGoingEntitlements` (WEB-522): presenças em todo
 * plano vigente, Starter inclusive, códigos só no Elite, e o plano parado
 * (pagamento atrasado, encerrado) não vê nenhum dos dois.
 */

const sameMonth = (ts: Parameters<typeof brasiliaDaySql>[0]) =>
  sql`left(${brasiliaDaySql(ts)}::text, 7) = left(${brasiliaTodaySql()}::text, 7)`

export async function readMonthProof(barId: string) {
  const result = await db.execute<{ people: number; codes: number }>(sql`
    SELECT
      (SELECT count(DISTINCT a.user_id)::int FROM ${attendance} a
        JOIN ${event} e ON e.id = a.event_id
        WHERE e.bar_id = ${barId} AND ${sameMonth(sql`e.starts_at`)}) AS people,
      (SELECT count(*)::int FROM ${reservationCodeUse} u
        JOIN ${reservationCode} c ON c.id = u.code_id
        JOIN ${reservation} r ON r.id = c.reservation_id
        JOIN ${event} e ON e.id = r.event_id
        WHERE e.bar_id = ${barId} AND u.undone_at IS NULL
          AND ${sameMonth(sql`e.starts_at`)}) AS codes
  `)
  const row = result.rows[0]
  return { people: Number(row?.people ?? 0), codes: Number(row?.codes ?? 0) }
}
