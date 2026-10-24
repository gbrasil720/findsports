import { type AnyColumn, type SQL, sql } from 'drizzle-orm'
import {
  BRASILIA_TIME_ZONE,
  DEFAULT_EVENT_DURATION_INTERVAL
} from './event-window'
import { event } from './schema/platform'

/**
 * O relógio do jogo em SQL: os mesmos nomes de `./event-window`, para as
 * consultas que filtram no banco. Só servidor (importa o schema); o navegador
 * e o app leem `./event-window`. `event-window-sql.integration.test.ts`
 * confere, no Postgres de verdade, que os dois lados concordam.
 *
 * `starts_at`, `ends_at` e `current_period_end` são `timestamp` sem fuso,
 * guardando UTC. Daí as duas regras que estas funções escondem:
 * - "agora" é `now() AT TIME ZONE 'UTC'`, não `now()`: comparar `timestamp`
 *   com `timestamptz` converte pelo fuso da SESSÃO;
 * - um `Date` do JS entra como texto com fuso (`::timestamptz`), nunca cru:
 *   o driver o escreve no fuso do PROCESSO, e o `::timestamp` o jogaria fora.
 */

const TZ = BRASILIA_TIME_ZONE

/**
 * Colunas de início e fim: as do Drizzle, ou `'e'`, o apelido que as
 * consultas cruas dão à tabela `event`.
 */
export type EventClock =
  | { startsAt: AnyColumn | SQL; endsAt: AnyColumn | SQL }
  | 'e'

function columns(e: EventClock) {
  if (e !== 'e') return e
  return { startsAt: sql`e.starts_at`, endsAt: sql`e.ends_at` }
}

/** Agora, como `timestamp` UTC. Sem `now`, o relógio do banco. */
export function utcNowSql(now?: Date): SQL {
  return now
    ? sql`(${now.toISOString()}::timestamptz AT TIME ZONE 'UTC')`
    : sql`(now() AT TIME ZONE 'UTC')`
}

/** Fim derivado: `ends_at`, senão `starts_at` + a duração padrão (`getEventEnd`). */
export function eventEndSql(e: EventClock = event): SQL {
  const { startsAt, endsAt } = columns(e)
  return sql`coalesce(${endsAt}, ${startsAt} + ${DEFAULT_EVENT_DURATION_INTERVAL}::interval)`
}

/** O fim derivado chegou (`hasEventEnded`). */
export function eventEndedSql(e: EventClock = event, now?: Date): SQL {
  return sql`(${eventEndSql(e)} <= ${utcNowSql(now)})`
}

/** Ainda não acabou: o próximo ou o que está rolando (`!hasEventEnded`). */
export function eventNotEndedSql(e: EventClock = event, now?: Date): SQL {
  return sql`(${eventEndSql(e)} > ${utcNowSql(now)})`
}

/** O dia de Brasília (`date`) de um `timestamp` UTC (`brasiliaDay`). */
export function brasiliaDaySql(ts: AnyColumn | SQL): SQL<string> {
  return sql<string>`((${ts} AT TIME ZONE 'UTC') AT TIME ZONE ${TZ})::date`
}

/** Hoje em Brasília, como `date`. */
export function brasiliaTodaySql(now?: Date): SQL<string> {
  return brasiliaDaySql(utcNowSql(now))
}

/**
 * Começo do dia de Brasília como `timestamp` UTC (`brasiliaDayStart`), mais
 * `plusDays` dias de calendário. `day` é "2026-10-24" ou uma expressão `date`.
 */
export function brasiliaDayStartSql(day: string | SQL, plusDays = 0): SQL {
  const date = typeof day === 'string' ? sql`${day}::date` : day
  return sql`(((${date} + ${plusDays}::int)::timestamp AT TIME ZONE ${TZ}) AT TIME ZONE 'UTC')`
}

/**
 * `ts` cai nos `days` dias de Brasília a partir de `from` (o dia todo, da
 * meia-noite à meia-noite). Compara a coluna crua, então usa o índice.
 */
export function onBrasiliaDaysSql(
  ts: AnyColumn | SQL,
  from: string | SQL,
  days = 1
): SQL {
  return sql`(${ts} >= ${brasiliaDayStartSql(from)} AND ${ts} < ${brasiliaDayStartSql(from, days)})`
}
