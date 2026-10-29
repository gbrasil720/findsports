import { db, sql } from '@findsports_oficial/db'
import { participantNames } from './game-participants'
import type { RatingReasonId } from './rating-reasons'
import { utcIso } from './utc-timestamp'

/**
 * As avaliações de um bar, da mais recente para a mais antiga, como o bar e
 * o torcedor as podem ver (WEB-451):
 *
 * - o comentário só depois de aprovado pela Onside (`/houdini/revisao`);
 *   em revisão ou recusado, sai `null`;
 * - o nome só de quem escolheu se identificar; o resto sai `null` e a tela
 *   diz "Anônimo".
 *
 * `public`: a página do bar ("O que dizem") lê só as verificadas com
 * comentário aprovado (WEB-408); o painel do dono lê todas, com a marca de
 * verificada.
 */
export async function readRatingList(
  barId: string,
  options: { public: boolean; limit: number }
) {
  const rows = await db.execute(sql`
    SELECT
      r.id,
      r.would_return,
      r.reasons,
      r.stars,
      r.verified,
      r.created_at,
      CASE WHEN r.comment_review = 'approved' THEN r.comment END AS comment,
      CASE WHEN r.identified THEN u.name END AS name,
      e.championship,
      e.participant_free_text,
      ${participantNames(sql`e.id`)} AS participants,
      e.starts_at
    FROM bar_rating r
    JOIN event e ON e.id = r.event_id
    JOIN "user" u ON u.id = r.actor_user_id
    WHERE r.bar_id = ${barId}
      ${options.public ? sql`AND r.verified AND r.comment_review = 'approved'` : sql``}
    ORDER BY r.created_at DESC
    LIMIT ${options.limit}
  `)
  return (
    rows.rows as {
      id: string
      would_return: boolean
      reasons: RatingReasonId[] | null
      stars: number | null
      verified: boolean
      created_at: string
      comment: string | null
      name: string | null
      championship: string
      participant_free_text: string | null
      participants: string[]
      starts_at: string
    }[]
  ).map((row) => ({
    id: row.id,
    wouldReturn: row.would_return,
    // "O que pesou?" (WEB-398).
    reasons: row.reasons ?? [],
    stars: row.stars,
    verified: row.verified,
    comment: row.comment,
    name: row.name,
    createdAt: utcIso(row.created_at),
    championship: row.championship,
    participantFreeText: row.participant_free_text,
    participants: row.participants,
    startsAt: utcIso(row.starts_at)
  }))
}
