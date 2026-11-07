import { db, sql } from '@findsports_oficial/db'
import { participantNames } from './game-participants'
import { type RatingReasonId, summarizeReasons } from './rating-reasons'
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
      r.comment_review = 'pending' AS comment_pending,
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
      comment_pending: boolean | null
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
    // O dono sabe que há comentário esperando a Onside, sem ler o texto.
    commentPending: row.comment_pending === true,
    name: row.name,
    createdAt: utcIso(row.created_at),
    championship: row.championship,
    participantFreeText: row.participant_free_text,
    participants: row.participants,
    startsAt: utcIso(row.starts_at)
  }))
}

/**
 * Quantas vezes cada etiqueta de "O que pesou?" foi citada no bar, de quem
 * voltaria e de quem não voltaria (WEB-398), resumida em até três de cada
 * lado, sem contagem. Só as avaliações verificadas (código validado ou
 * check-in, WEB-408), como a nota. Lida por `pubs.getById` e pela página
 * pública do bar.
 */
export async function readReasonSummary(barId: string) {
  const rows = await db.execute(sql`
    SELECT r.would_return, reason, COUNT(*)::int AS count
    FROM bar_rating r, unnest(r.reasons) AS reason
    WHERE r.bar_id = ${barId} AND r.verified
    GROUP BY r.would_return, reason
  `)
  return summarizeReasons(
    (
      rows.rows as { would_return: boolean; reason: string; count: number }[]
    ).map((row) => ({
      wouldReturn: row.would_return,
      reason: row.reason,
      count: Number(row.count)
    }))
  )
}
