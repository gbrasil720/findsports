import { db, sql } from '@findsports_oficial/db'
import {
  eventEndedSql,
  utcNowSql
} from '@findsports_oficial/db/event-window-sql'
import { INTEREST_MIN_HISTORY } from './attendance'
import { pctChange } from './commercial-analytics/types'
import { gameTitle } from './game-participants'
import { visit } from './visits'

/*
 * A faixa de números do jogo publicado no painel (WEB-433, PJ-depois e
 * PJ-estados): por jogo do bar, quantos se interessaram (WhatsApp, rota ou
 * telefone por esse jogo, o mesmo "se interessaram" do painel), quantos nas
 * últimas 24 h, quantos abriram o bar por ele e quantos outros bares do
 * bairro publicaram o mesmo jogo. Os jogos encerrados ganham a comparação
 * com a média do bar.
 *
 * Os números são do próprio bar, sem nome de ninguém, e somam as ações que
 * a série diária já mostra a todo plano (WEB-449); a contagem de quem vai
 * segue só no Elite (`barReservations.going`, WEB-127).
 *
 * "Primeira vez no bar" (WEB-530, só Elite, do começo do jogo em diante): de
 * quem chegou com código neste jogo, quantos não tinham visita (`visits.ts`)
 * a este bar num jogo anterior. É a mesma regra do selo de primeira visita
 * do Quem vai, que já mostra cada um pelo nome: por isso não há piso.
 */

/** Jogos de até 60 dias atrás: Próximos e o começo de Passados. */
const WINDOW_DAYS = 60

const HIGH_INTENT = sql`('directions_opened', 'phone_clicked', 'whatsapp_opened')`

export type EventNumbers = {
  eventId: string
  interested: number
  /** Dos `interested`, quantos vieram nas últimas 24 h. */
  interestedLastDay: number
  views: number
  /** Outros bares no ar do mesmo bairro com o mesmo jogo publicado. */
  barsInNeighborhood: number
  /** Jogo encerrado: % contra a média do bar; nulo sem histórico. */
  vsAverage: number | null
  /** Elite, jogo começado: chegaram com código sem visita anterior aqui. */
  firstTime: number | null
}

type Row = {
  id: string
  ended: boolean
  interested: number
  interested_day: number
  views: number
  bars: number
  first_time: number | null
}

/** A conta da média, sem banco: só jogos encerrados, com histórico mínimo. */
export function withAverage<T extends { eventId: string; interested: number }>(
  rows: readonly T[],
  ended: ReadonlySet<string>
): (T & { vsAverage: number | null })[] {
  const past = rows.filter((r) => ended.has(r.eventId))
  const average =
    past.length >= INTEREST_MIN_HISTORY
      ? past.reduce((sum, r) => sum + r.interested, 0) / past.length
      : null
  return rows.map((r) => ({
    ...r,
    vsAverage:
      average !== null && ended.has(r.eventId)
        ? pctChange(r.interested, average)
        : null
  }))
}

export async function readEventNumbers(input: {
  barId: string
  city: string
  neighborhood: string
  /** Elite vigente (`issuesCounterCode`): só ele vê "primeira vez no bar". */
  elite: boolean
  now?: Date
}): Promise<EventNumbers[]> {
  const now = input.now ?? new Date()
  const { rows } = await db.execute<Row>(sql`
    WITH mine AS (
      SELECT e.id, e.starts_at,
        ${gameTitle({
          id: sql`e.id`,
          participantFreeText: sql`e.participant_free_text`,
          championship: sql`e.championship`
        })} AS title,
        ${eventEndedSql('e', now)} AS ended
      FROM event e
      WHERE e.bar_id = ${input.barId}
        AND e.published_at IS NOT NULL
        AND e.starts_at >= ${utcNowSql(now)} - make_interval(days => ${WINDOW_DAYS})
    )
    SELECT m.id, m.ended,
      (SELECT count(DISTINCT c.actor_user_id)::int FROM bar_commercial_event c
       WHERE c.bar_id = ${input.barId} AND c.source_event_id = m.id
         AND c.type IN ${HIGH_INTENT}) AS interested,
      (SELECT count(DISTINCT c.actor_user_id)::int FROM bar_commercial_event c
       WHERE c.bar_id = ${input.barId} AND c.source_event_id = m.id
         AND c.type IN ${HIGH_INTENT}
         AND c.occurred_at >= ${now.toISOString()}::timestamptz - interval '24 hours'
      ) AS interested_day,
      (SELECT count(DISTINCT c.actor_user_id)::int FROM bar_commercial_event c
       WHERE c.bar_id = ${input.barId} AND c.source_event_id = m.id
         AND c.type = 'profile_view') AS views,
      (SELECT count(DISTINCT o.bar_id)::int
       FROM event o JOIN bar b ON b.id = o.bar_id
       WHERE b.id <> ${input.barId}
         AND b.is_active
         AND o.published_at IS NOT NULL
         AND search_normalize(b.city) = search_normalize(${input.city})
         AND search_normalize(b.neighborhood) = search_normalize(${input.neighborhood})
         AND o.starts_at = m.starts_at
         AND (
           ${gameTitle({
             id: sql`o.id`,
             participantFreeText: sql`o.participant_free_text`,
             championship: sql`o.championship`
           })} = m.title
           OR EXISTS (
             SELECT 1 FROM event_participants a
             JOIN event_participants p ON p.team_id = a.team_id
             WHERE a.event_id = o.id AND p.event_id = m.id
           )
         )
      ) AS bars,
      CASE WHEN ${input.elite} AND m.starts_at <= ${utcNowSql(now)} THEN (
        SELECT count(DISTINCT r.user_id)::int
        FROM reservation_code_use u
        JOIN reservation_code rc ON rc.id = u.code_id
        JOIN reservation r ON r.id = rc.reservation_id
        WHERE r.event_id = m.id AND u.undone_at IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM ${visit}
            JOIN event ve ON ve.id = ${visit.eventId}
            WHERE ${visit.userId} = r.user_id
              AND ${visit.barId} = ${input.barId}
              AND ${visit.eventId} <> m.id
              AND ve.starts_at <= m.starts_at
          )
      ) END AS first_time
    FROM mine m
  `)
  return withAverage(
    rows.map((r) => ({
      eventId: r.id,
      interested: r.interested,
      interestedLastDay: r.interested_day,
      views: r.views,
      barsInNeighborhood: r.bars,
      firstTime: r.first_time
    })),
    new Set(rows.filter((r) => r.ended).map((r) => r.id))
  )
}
