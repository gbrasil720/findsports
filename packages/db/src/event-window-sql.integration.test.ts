import { describe, expect, test } from 'bun:test'
import { type SQL, sql } from 'drizzle-orm'
import {
  brasiliaDay,
  brasiliaDayStart,
  DEFAULT_EVENT_DURATION_MS,
  hasEventEnded
} from './event-window'
import {
  brasiliaDaySql,
  brasiliaDayStartSql,
  brasiliaTodaySql,
  eventEndedSql,
  eventNotEndedSql,
  onBrasiliaDaysSql
} from './event-window-sql'
import { db } from './index'
import { isDisposableTestDatabase } from './utils/db-resolver'

/**
 * O relógio do jogo tem dois lados, TypeScript (`event-window`) e SQL
 * (`event-window-sql`). Este teste pergunta a mesma coisa aos dois, no
 * Postgres de verdade, nas bordas onde eles já discordaram: 21h–23h59 de
 * Brasília (já é o dia seguinte no UTC), a virada do dia, jogo sem
 * `ends_at`, o instante exato do fim e o horário de verão histórico. Roda
 * com a sessão em UTC (como em produção) e em Brasília, para provar que o
 * fuso da sessão não muda a resposta.
 */
const integrationTest = isDisposableTestDatabase() ? test : test.skip

/** Um `timestamp` sem fuso guardando UTC, como as colunas do `event`. */
const column = (at: Date) =>
  sql`${at.toISOString().slice(0, 23).replace('T', ' ')}::timestamp`

const INSTANTS = [
  '2026-10-24T23:59:59.999Z', // 20:59:59 em Brasília
  '2026-10-25T00:00:00.000Z', // 21:00 — dia seguinte no UTC
  '2026-10-25T02:59:59.999Z', // 23:59:59.999 de Brasília
  '2026-10-25T03:00:00.000Z', // meia-noite de Brasília
  '2026-12-31T23:30:00.000Z', // 20:30 do réveillon
  '2027-01-01T02:30:00.000Z', // 23:30 do réveillon, ano novo no UTC
  '2018-11-04T02:59:59.000Z', // 23:59:59 de 03/11, antes do pulo do verão
  '2018-11-04T03:00:00.000Z', // 01:00 de 04/11, já em -02:00
  '2018-12-15T01:59:59.000Z', // 23:59:59 em -02:00
  '2018-12-15T02:00:00.000Z', // meia-noite em -02:00
  '2019-02-17T01:59:59.000Z', // 23:59:59 de 16/02, ainda em -02:00
  '2019-02-17T02:30:00.000Z', // 23:30 de 16/02 de novo, já em -03:00
  '2019-02-17T03:00:00.000Z' // meia-noite de 17/02
].map((iso) => new Date(iso))

const DAYS = [
  '2026-10-24',
  '2026-10-25',
  '2027-01-01',
  '2018-11-04', // sem meia-noite: começou o horário de verão
  '2018-12-15',
  '2019-02-17' // a meia-noite foi depois de repetir 23h
]

const SESSION_ZONES = ['UTC', 'America/Sao_Paulo']

async function inSession<T>(zone: string, query: SQL): Promise<T[]> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('TimeZone', ${zone}, true)`)
    return (await tx.execute(query)).rows as T[]
  })
}

describe('relógio do jogo: SQL e TypeScript concordam', () => {
  for (const zone of SESSION_ZONES) {
    integrationTest(
      `dia de Brasília de um instante (sessão ${zone})`,
      async () => {
        for (const at of INSTANTS) {
          const [row] = await inSession<{ day: string }>(
            zone,
            sql`SELECT to_char(${brasiliaDaySql(column(at))}, 'YYYY-MM-DD') AS day`
          )
          expect({ at, day: row?.day }).toEqual({ at, day: brasiliaDay(at) })
        }
      }
    )

    integrationTest(`hoje, com o agora fixo (sessão ${zone})`, async () => {
      for (const now of INSTANTS) {
        const [row] = await inSession<{ day: string }>(
          zone,
          sql`SELECT to_char(${brasiliaTodaySql(now)}, 'YYYY-MM-DD') AS day`
        )
        expect({ now, day: row?.day }).toEqual({ now, day: brasiliaDay(now) })
      }
    })

    integrationTest(`começo do dia (sessão ${zone})`, async () => {
      for (const day of DAYS) {
        const [row] = await inSession<{ start: string }>(
          zone,
          sql`SELECT to_char(${brasiliaDayStartSql(day)}, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS start`
        )
        expect({ day, start: row?.start }).toEqual({
          day,
          start: brasiliaDayStart(day).toISOString()
        })
      }
    })

    integrationTest(`instante dentro do dia (sessão ${zone})`, async () => {
      for (const at of INSTANTS) {
        const day = brasiliaDay(at)
        const [row] = await inSession<{
          same: boolean
          before: boolean
          after: boolean
          week: boolean
        }>(
          zone,
          sql`SELECT
            ${onBrasiliaDaysSql(column(at), day)} AS same,
            ${onBrasiliaDaysSql(column(at), brasiliaDay(at, -1))} AS before,
            ${onBrasiliaDaysSql(column(at), brasiliaDay(at, 1))} AS after,
            ${onBrasiliaDaysSql(column(at), sql`${brasiliaDay(at, -6)}::date`, 7)} AS week`
        )
        expect({ at, ...row }).toEqual({
          at,
          same: true,
          before: false,
          after: false,
          week: true
        })
      }
    })

    integrationTest(
      `fim derivado e borda do fim (sessão ${zone})`,
      async () => {
        const startsAt = new Date('2026-10-25T00:30:00.000Z') // 21:30 de Brasília
        const games = [
          { startsAt, endsAt: null },
          { startsAt, endsAt: new Date(startsAt.getTime() + 60 * 60 * 1000) },
          {
            startsAt,
            endsAt: new Date(startsAt.getTime() + 5 * 60 * 60 * 1000)
          }
        ]
        for (const game of games) {
          const end = (
            game.endsAt ??
            new Date(startsAt.getTime() + DEFAULT_EVENT_DURATION_MS)
          ).getTime()
          for (const now of [end - 1, end, end + 1].map((ms) => new Date(ms))) {
            const [row] = await inSession<{ ended: boolean; open: boolean }>(
              zone,
              sql`SELECT ${eventEndedSql('e', now)} AS ended,
                ${eventNotEndedSql('e', now)} AS open
              FROM (VALUES (${column(game.startsAt)}, ${
                game.endsAt ? column(game.endsAt) : sql`NULL::timestamp`
              })) AS e(starts_at, ends_at)`
            )
            const ended = hasEventEnded(game, now)
            expect({ game, now, ...row }).toEqual({
              game,
              now,
              ended,
              open: !ended
            })
          }
        }
      }
    )
  }
})
