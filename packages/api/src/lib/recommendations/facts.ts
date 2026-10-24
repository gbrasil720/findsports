import { db, sql } from '@findsports_oficial/db'
import { utcNowSql } from '@findsports_oficial/db/event-window-sql'

import { getAppConfig } from '../app-config/db-source'
import { hasPublicRating, ratingPercentage } from '../rating'
import { visit } from '../visits'
import {
  DAY_MS,
  jaccard,
  type RankedRecommendation,
  RECOMMENDATION_QUALITY_WINDOW_DAYS
} from './ranking'

/*
 * O que a frase do card e a 22c ("Por que esse bar?") precisam, com os
 * números de verdade: quantas vezes abriu o jogo, o time que viu, o bar
 * parecido e quantas vezes foi lá, a nota pública. O app só monta a frase;
 * não inventa número. Lido em lote, só para os bares escolhidos (até cinco).
 */

export type RecommendationFacts = {
  /** Aberturas do perfil vindas de um jogo, nos últimos 7 dias. */
  gameOpensWeek: number
  /** Aberturas diretas do perfil, nos últimos 7 dias. */
  viewsWeek: number
  /** Rota, telefone, WhatsApp ou Curti na janela do ranking. */
  highIntent: boolean
  ratedPositive: boolean
  /** O esporte seu que o bar passa ("futebol"). */
  sport: string | null
  /** Um time que você viu e que joga num jogo marcado do bar. */
  team: string | null
  /** Características do bar em comum com os que você mais curte. */
  shared: number[]
  /** Os bares do seu histórico mais parecidos com este, com as visitas. */
  references: { name: string; visits: number }[]
  /** A nota pública, só quando a plataforma a mostra (piso e app_config). */
  rating: { percentage: number; total: number } | null
  /** Os esportes que o bar costuma passar ("futebol e F1"), com o id. */
  usualSports: { id: string; name: string }[]
}

type BarRow = {
  id: string
  team: string | null
  rating_count: number | string
  rating_positive: number | string
  usual_sports: { id: string; name: string }[] | null
}

type SignatureRow = {
  id: string
  name: string
  amenities: number[] | null
  visits: number | string
}

const WEEK_DAYS = 7

export async function loadRecommendationFacts(input: {
  userId: string
  items: RankedRecommendation[]
  now: Date
}): Promise<Map<string, RecommendationFacts>> {
  if (input.items.length === 0) return new Map()
  const ids = JSON.stringify(input.items.map((item) => item.bar.id))
  const windowStart = new Date(
    input.now.getTime() - RECOMMENDATION_QUALITY_WINDOW_DAYS * DAY_MS
  )
  const boundary = sql`GREATEST(
    ${windowStart}::timestamptz,
    COALESCE(
      (SELECT rr.reset_at FROM recommendation_reset rr WHERE rr.actor_user_id = ${input.userId}),
      ${windowStart}::timestamptz
    )
  )`

  const [bars, signature, publicDisplay] = await Promise.all([
    db.execute(sql`
      WITH ids AS (SELECT jsonb_array_elements_text(${ids}::jsonb) AS id),
      recent_teams AS (
        SELECT DISTINCT ep.team_id
        FROM bar_commercial_event ce
        JOIN event_participants ep ON ep.event_id = ce.source_event_id
        WHERE ce.actor_user_id = ${input.userId}
          AND ce.type <> 'classic_exposure'
          AND ce.occurred_at >= ${boundary}
      )
      SELECT
        b.id,
        b.rating_count,
        b.rating_positive,
        (
          SELECT t.name
          FROM event e
          JOIN event_participants ep ON ep.event_id = e.id
          JOIN recent_teams rt ON rt.team_id = ep.team_id
          JOIN team t ON t.id = ep.team_id
          WHERE e.bar_id = b.id AND e.published_at IS NOT NULL
            AND e.starts_at >= ${utcNowSql(input.now)}
          ORDER BY e.starts_at, t.name
          LIMIT 1
        ) AS team,
        (
          SELECT json_agg(json_build_object('id', usual.id, 'name', usual.name))
          FROM (
            SELECT s.id, s.name
            FROM event e
            JOIN sport s ON s.id = e.sport_id
            WHERE e.bar_id = b.id
              AND e.published_at IS NOT NULL
              AND e.starts_at >= ${utcNowSql(input.now)} - INTERVAL '120 days'
            GROUP BY s.id, s.name
            ORDER BY COUNT(*) DESC, s.name
            LIMIT 2
          ) usual
        ) AS usual_sports
      FROM ids
      JOIN bar b ON b.id = ids.id
    `),
    // A assinatura do ranking (favoritos, "voltaria" e intenção forte), com
    // as visitas (`visits.ts`): é o "onde você foi 4 vezes".
    db.execute(sql`
      WITH positive AS (
        SELECT ufb.bar_id AS id FROM user_favorite_bars ufb
        WHERE ufb.user_id = ${input.userId}
        UNION
        SELECT r.bar_id FROM bar_rating r
        WHERE r.actor_user_id = ${input.userId}
          AND r.would_return
          AND r.updated_at >= ${boundary}
        UNION
        SELECT ce.bar_id FROM bar_commercial_event ce
        WHERE ce.actor_user_id = ${input.userId}
          AND ce.type IN ('directions_opened', 'phone_clicked', 'whatsapp_opened')
          AND ce.occurred_at >= ${boundary}
      )
      SELECT
        b.id,
        b.name,
        b.amenities,
        (
          SELECT COUNT(*) FROM ${visit}
          WHERE ${visit.userId} = ${input.userId} AND ${visit.barId} = b.id
        )::int AS visits
      FROM positive
      JOIN bar b ON b.id = positive.id
    `),
    getAppConfig('rating.public_display')
  ])

  const signatureRows = signature.rows as SignatureRow[]
  const signatureAmenities = new Set(
    signatureRows.flatMap((row) => row.amenities ?? [])
  )
  const byId = new Map((bars.rows as BarRow[]).map((row) => [row.id, row]))
  const weekAgo = input.now.getTime() - WEEK_DAYS * DAY_MS

  return new Map(
    input.items.map((item) => {
      const row = byId.get(item.bar.id)
      const actions = item.bar.intentActions
      const thisWeek = (kind: string) =>
        actions.filter(
          (action) =>
            action.kind === kind && action.occurredAt.getTime() >= weekAgo
        ).length
      const ratingCount = Number(row?.rating_count ?? 0)
      const references = signatureRows
        .map((other) => ({
          name: other.name,
          visits: Number(other.visits),
          similarity: jaccard(item.bar.amenities, other.amenities ?? [])
        }))
        .filter((other) => other.similarity > 0)
        .sort(
          (a, b) =>
            b.visits - a.visits ||
            b.similarity - a.similarity ||
            a.name.localeCompare(b.name)
        )
        .slice(0, 2)
        .map(({ name, visits }) => ({ name, visits }))
      const facts: RecommendationFacts = {
        gameOpensWeek: thisWeek('game_view'),
        viewsWeek: thisWeek('direct_view'),
        highIntent: actions.some((action) => action.kind === 'high_intent'),
        ratedPositive: actions.some(
          (action) => action.kind === 'positive_rating'
        ),
        sport: item.bar.matchedSportName,
        team: row?.team ?? null,
        shared: item.bar.amenities.filter((id) => signatureAmenities.has(id)),
        references,
        rating:
          publicDisplay && hasPublicRating(ratingCount)
            ? {
                percentage: ratingPercentage(
                  Number(row?.rating_positive ?? 0),
                  ratingCount
                ),
                total: ratingCount
              }
            : null,
        usualSports: row?.usual_sports ?? []
      }
      return [item.bar.id, facts]
    })
  )
}
