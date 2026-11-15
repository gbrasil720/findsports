import { type db, sql } from '@findsports_oficial/db'

/**
 * O que a exclusão de um jogo levaria junto (WEB-252). `reservation`,
 * `attendance`, `attendance_report` e `bar_rating` apagam em cascata com
 * `event`; quem decide se o jogo pode sumir é `getEventDeletionBlock`.
 *
 * - Bloqueiam: código de quem marcou "Vou assistir aqui" num bar Elite (em
 *   qualquer tempo: depois do jogo ele é o histórico do torcedor e a prova
 *   de comparecimento) e avaliação. O código mora em `reservation`
 *   (`attendance-ticket.ts`).
 * - Vão junto: códigos de quem desmarcou (e pedidos da reserva de mesa, que
 *   saiu) e presenças.
 *
 * Da presença sai só "tem ou não tem": o bar nunca vê o número absoluto
 * (ADR 0003, "Presença").
 */
export type EventDeletionImpact = {
  confirmedReservations: number
  ratings: number
  closedReservations: number
  hasAttendance: boolean
}

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

type ImpactRow = {
  event_id: string
  confirmed: number
  total: number
  ratings: number
  has_attendance: boolean
}

/** Uma consulta para todos os jogos do bar, ou só para `eventId`. */
export async function readEventDeletionImpact(
  executor: typeof db | Transaction,
  barId: string,
  eventId?: string
): Promise<Map<string, EventDeletionImpact>> {
  const result = await executor.execute(sql`
    SELECT
      e.id AS event_id,
      r.confirmed,
      r.total,
      (SELECT count(*)::int FROM bar_rating br WHERE br.event_id = e.id) AS ratings,
      EXISTS (SELECT 1 FROM attendance a WHERE a.event_id = e.id) AS has_attendance
    FROM event e
    CROSS JOIN LATERAL (
      SELECT
        count(*) FILTER (WHERE res.status = 'confirmed')::int AS confirmed,
        count(*)::int AS total
      FROM reservation res
      WHERE res.event_id = e.id
    ) r
    WHERE e.bar_id = ${barId}
      ${eventId ? sql`AND e.id = ${eventId}` : sql``}
  `)

  return new Map(
    (result.rows as ImpactRow[]).map((row) => [
      row.event_id,
      {
        confirmedReservations: row.confirmed,
        ratings: row.ratings,
        closedReservations: row.total - row.confirmed,
        hasAttendance: row.has_attendance
      }
    ])
  )
}

const count = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`

/** Motivo da recusa, com as contagens; `null` quando o jogo pode ser excluído. */
export function getEventDeletionBlock(
  impact: EventDeletionImpact
): string | null {
  const active = impact.confirmedReservations
  const reasons = [
    active > 0 && count(active, 'código de quem vai', 'códigos de quem vai'),
    impact.ratings > 0 && count(impact.ratings, 'avaliação', 'avaliações')
  ].filter(Boolean)
  if (reasons.length === 0) return null
  return `Este jogo tem ${reasons.join(' e ')} e não pode ser excluído.`
}
