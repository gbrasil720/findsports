import { and, db, eq, sql } from '@findsports_oficial/db'
import {
  brasiliaDay,
  getValidationWindow,
  isWithinValidationWindow
} from '@findsports_oficial/db/event-window'
import { onBrasiliaDaysSql } from '@findsports_oficial/db/event-window-sql'
import {
  CHECK_IN_MIN_ACCOUNT_AGE_DAYS,
  CHECK_IN_RADIUS_M,
  CHECK_INS_PER_DAY
} from '@findsports_oficial/db/rating-limits'
import { attendanceCheckin } from '@findsports_oficial/db/schema/attendance'
import { TRPCError } from '@trpc/server'
import { utcIso } from './utc-timestamp'
import { visit } from './visits'

type EventTimes = Parameters<typeof getValidationWindow>[0]

/*
 * Check-in "Estou aqui" (WEB-408): o torcedor, com o app aberto, manda a
 * posição; quem decide é o servidor. Vale dentro da janela do jogo (a mesma
 * do código do balcão, 3 h antes a 3 h depois) e até `CHECK_IN_RADIUS_M` do
 * bar. Um por jogo, dois por dia de Brasília. Conta como visita
 * (`visits.ts`) e torna verificada a avaliação daquele jogo (o banco cuida,
 * `bar_rating.verified`) só se a conta já tinha 7 dias (`checkInVerifies`).
 *
 * Localização falsa no celular passa: o ganho é deixar o ataque à nota caro,
 * não impossível.
 */

const DAY_MS = 86_400_000

/**
 * O check-in verifica a avaliação: a conta tinha `CHECK_IN_MIN_ACCOUNT_AGE_DAYS`
 * na hora dele. Mesma regra de `bar_rating_is_verified` (migration 0101).
 */
export function checkInVerifies(accountCreatedAt: Date, checkedInAt: Date) {
  return (
    checkedInAt.getTime() - accountCreatedAt.getTime() >=
    CHECK_IN_MIN_ACCOUNT_AGE_DAYS * DAY_MS
  )
}

/** Mesma regra em SQL, para leituras com `c` = check-in e `a` = conta. */
export const checkInVerifiesSql = sql`c.created_at >= (a.created_at AT TIME ZONE 'UTC') + make_interval(days => ${CHECK_IN_MIN_ACCOUNT_AGE_DAYS})`

export const CHECK_IN_DAILY_LIMIT_MESSAGE = `Você já fez ${CHECK_INS_PER_DAY} check-ins hoje. Volte amanhã.`

/** Por que o check-in não vale, ou `null` se vale. Regra pura, testada. */
export function checkInRefusal(input: {
  event: EventTimes
  distanceM: number
  now: Date
}): string | null {
  if (!isWithinValidationWindow(input.event, input.now)) {
    const { opensAt } = getValidationWindow(input.event)
    return input.now < opensAt
      ? 'O check-in abre 3 h antes do jogo.'
      : 'O check-in deste jogo já fechou.'
  }
  if (input.distanceM > CHECK_IN_RADIUS_M) {
    return `Você está a ${formatDistance(input.distanceM)} do bar. Chegue a até ${CHECK_IN_RADIUS_M} m para fazer o check-in.`
  }
  return null
}

/** "420 m", "1 km", "2,4 km": de 10 em 10 m para cima (151 m não pode virar "150 m", o limite). */
export function formatDistance(meters: number) {
  const rounded = Math.ceil(meters / 10) * 10
  if (rounded < 1000) return `${rounded} m`
  return `${(rounded / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km`
}

export async function checkIn(
  userId: string,
  input: { eventId: string; latitude: number; longitude: number },
  now = new Date()
) {
  const rows = await db.execute(sql`
    SELECT
      e.starts_at,
      e.ends_at,
      ST_Distance(
        b.geo,
        ST_SetSRID(ST_MakePoint(${input.longitude}, ${input.latitude}), 4326)::geography
      ) AS distance_m
    FROM event e
    JOIN bar b ON b.id = e.bar_id
    WHERE e.id = ${input.eventId}
      AND e.published_at IS NOT NULL
      AND b.is_active
  `)
  const row = rows.rows[0] as
    | { starts_at: string; ends_at: string | null; distance_m: number }
    | undefined
  if (!row) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Jogo não encontrado.' })
  }
  const distanceM = Math.round(Number(row.distance_m))
  const refusal = checkInRefusal({
    event: {
      startsAt: utcIso(row.starts_at),
      endsAt: row.ends_at ? utcIso(row.ends_at) : null
    },
    distanceM,
    now
  })
  if (refusal) {
    throw new TRPCError({ code: 'PRECONDITION_FAILED', message: refusal })
  }
  await db.transaction(async (tx) => {
    // Enfileira os check-ins da conta: pedidos ao mesmo tempo não furam o teto.
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`checkin:${userId}`}))`
    )
    const counted = await tx.execute<{ today: number; here: boolean }>(sql`
      SELECT
        count(*) FILTER (WHERE ${onBrasiliaDaysSql(
          sql`(created_at AT TIME ZONE 'UTC')`,
          brasiliaDay(now)
        )})::int AS today,
        bool_or(event_id = ${input.eventId}) AS here
      FROM attendance_checkin WHERE user_id = ${userId}
    `)
    const { today = 0, here = false } = counted.rows[0] ?? {}
    // Repetido não é erro: o primeiro check-in vale e o segundo só o confirma.
    if (here) return
    if (today >= CHECK_INS_PER_DAY) {
      throw new TRPCError({
        code: 'TOO_MANY_REQUESTS',
        message: CHECK_IN_DAILY_LIMIT_MESSAGE
      })
    }
    await tx
      .insert(attendanceCheckin)
      .values({ userId, ...input, distanceM, createdAt: now })
      .onConflictDoNothing()
  })
  return { checkedIn: true }
}

/**
 * O jogo deste bar em que dá para fazer check-in agora, para o botão da
 * página do bar. `done`: a presença já está confirmada, pelo check-in ou
 * pelo código validado no balcão.
 */
export async function readCheckIn(
  userId: string,
  games: { id: string; startsAt: Date; endsAt: Date | null }[],
  now = new Date()
): Promise<{ eventId: string; done: boolean; at: string | null } | null> {
  const game = games.find((g) => isWithinValidationWindow(g, now))
  if (!game) return null
  const [found] = await db
    .select({ eventId: visit.eventId, at: visit.visitedAt })
    .from(visit)
    .where(and(eq(visit.userId, userId), eq(visit.eventId, game.id)))
    .limit(1)
  // `at`: a hora da presença ("Presença confirmada · 21:47", rodada 3).
  return {
    eventId: game.id,
    done: Boolean(found),
    at: found?.at ? new Date(found.at).toISOString() : null
  }
}
