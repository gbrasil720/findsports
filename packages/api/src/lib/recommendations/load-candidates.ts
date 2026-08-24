import { db, sql } from '@findsports_oficial/db'

import {
  DAY_MS,
  jaccard,
  RECOMMENDATION_INTENT_KINDS,
  RECOMMENDATION_QUALITY_WINDOW_DAYS,
  RECOMMENDATION_UNFAVORITE_COOLDOWN_DAYS,
  type RecommendationCandidate,
  type RecommendationIntentAction,
  type RecommendationIntentKind
} from './ranking'

type CandidateRow = {
  id: string
  name: string
  neighborhood: string
  city: string
  latitude: string
  longitude: string
  photo_url: string | null
  amenities: number[] | null
  screen_count: number | null
  distance_km: number | string
  rating_count: number | string
  rating_score: number | string | null
  recent_rating_count: number | string
  recent_rating_positive: number | string
  event_count: number | string
  sport_ids: string[] | null
  preferred_sport_match: boolean
  recent_sport_match: boolean
  recent_team_match: boolean
  matched_sport_name: string | null
  next_event_id: string | null
  next_championship: string | null
  next_event_starts_at: string | null
  next_sport_id: string | null
  next_sport_name: string | null
  next_sport_slug: string | null
  signature_amenities: number[] | null
  signature_screen_count: number | string | null
  signature_neighborhoods: string[] | null
  negative_amenities: number[] | null
  negative_neighborhoods: string[] | null
  intent_actions: Array<{ kind: string; occurredAt: string }> | null
}

function numeric(value: number | string | null | undefined): number {
  const parsed = typeof value === 'number' ? value : Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

const VALID_INTENT_KINDS = new Set<RecommendationIntentKind>(
  RECOMMENDATION_INTENT_KINDS
)

function parseIntentActions(
  actions: CandidateRow['intent_actions']
): RecommendationIntentAction[] {
  if (!Array.isArray(actions)) return []
  return actions.flatMap((action) => {
    if (!VALID_INTENT_KINDS.has(action.kind as RecommendationIntentKind)) {
      return []
    }
    const occurredAt = new Date(action.occurredAt)
    if (Number.isNaN(occurredAt.getTime())) return []
    return [
      {
        kind: action.kind as RecommendationIntentKind,
        occurredAt
      }
    ]
  })
}

export async function loadRecommendationCandidates(input: {
  userId: string
  lat: number
  lng: number
  radiusKm: number
  now: Date
}): Promise<RecommendationCandidate[]> {
  const sixtyDaysAgo = new Date(
    input.now.getTime() - RECOMMENDATION_QUALITY_WINDOW_DAYS * DAY_MS
  )
  const thirtyDaysAgo = new Date(
    input.now.getTime() - RECOMMENDATION_UNFAVORITE_COOLDOWN_DAYS * DAY_MS
  )
  const expandedRadiusMeters = input.radiusKm * 1.5 * 1000

  const results = await db.execute(sql`
    WITH params AS MATERIALIZED (
      SELECT
        ST_SetSRID(ST_MakePoint(${input.lng}, ${input.lat}), 4326)::geography AS origin,
        ${expandedRadiusMeters}::double precision AS expanded_radius
    ),
    reset_boundary AS MATERIALIZED (
      SELECT GREATEST(
        ${sixtyDaysAgo}::timestamptz,
        COALESCE(
          (SELECT rr.reset_at FROM recommendation_reset rr WHERE rr.actor_user_id = ${input.userId}),
          ${sixtyDaysAgo}::timestamptz
        )
      ) AS starts_at
    ),
    preferences AS MATERIALIZED (
      SELECT ups.sport_id
      FROM user_preference_sports ups
      WHERE ups.user_id = ${input.userId}
    ),
    recent_sports AS MATERIALIZED (
      SELECT DISTINCT e.sport_id
      FROM bar_commercial_event ce
      JOIN event e ON e.id = ce.source_event_id
      CROSS JOIN reset_boundary rb
      WHERE ce.actor_user_id = ${input.userId}
        AND ce.occurred_at >= rb.starts_at
    ),
    recent_teams AS MATERIALIZED (
      SELECT DISTINCT ep.team_id
      FROM bar_commercial_event ce
      JOIN event_participants ep ON ep.event_id = ce.source_event_id
      CROSS JOIN reset_boundary rb
      WHERE ce.actor_user_id = ${input.userId}
        AND ce.occurred_at >= rb.starts_at
    ),
    spatial_candidates AS MATERIALIZED (
      SELECT b.id
      FROM bar b
      CROSS JOIN params p
      WHERE b.is_active
        AND ST_DWithin(b.geo, p.origin, p.expanded_radius)
      ORDER BY b.geo <-> p.origin
      LIMIT 200
    ),
    sport_candidates AS MATERIALIZED (
      SELECT b.id
      FROM bar b
      JOIN event e ON e.bar_id = b.id
      JOIN preferences pref ON pref.sport_id = e.sport_id
      CROSS JOIN params p
      WHERE b.is_active
        AND e.starts_at >= ${input.now}
        AND ST_DWithin(b.geo, p.origin, p.expanded_radius)
      GROUP BY b.id
      ORDER BY MIN(e.starts_at), b.id
      LIMIT 100
    ),
    intent_candidates AS MATERIALIZED (
      SELECT candidate.id
      FROM (
        SELECT ce.bar_id AS id, MAX(ce.occurred_at) AS last_action
        FROM bar_commercial_event ce
        CROSS JOIN reset_boundary rb
        WHERE ce.actor_user_id = ${input.userId}
          AND ce.occurred_at >= rb.starts_at
        GROUP BY ce.bar_id
        UNION ALL
        SELECT r.bar_id AS id, MAX(r.updated_at) AS last_action
        FROM bar_rating r
        CROSS JOIN reset_boundary rb
        WHERE r.actor_user_id = ${input.userId}
          AND r.would_return
          AND r.updated_at >= rb.starts_at
        GROUP BY r.bar_id
      ) candidate
      JOIN bar b ON b.id = candidate.id
      CROSS JOIN params p
      WHERE b.is_active
        AND ST_DWithin(b.geo, p.origin, p.expanded_radius)
      GROUP BY candidate.id
      ORDER BY MAX(candidate.last_action) DESC, candidate.id
      LIMIT 50
    ),
    candidate_ids AS MATERIALIZED (
      SELECT id FROM spatial_candidates
      UNION
      SELECT id FROM sport_candidates
      UNION
      SELECT id FROM intent_candidates
    ),
    positive_bar_ids AS MATERIALIZED (
      SELECT ufb.bar_id AS id
      FROM user_favorite_bars ufb
      WHERE ufb.user_id = ${input.userId}
      UNION
      SELECT r.bar_id AS id
      FROM bar_rating r
      CROSS JOIN reset_boundary rb
      WHERE r.actor_user_id = ${input.userId}
        AND r.would_return
        AND r.updated_at >= rb.starts_at
      UNION
      SELECT ce.bar_id AS id
      FROM bar_commercial_event ce
      CROSS JOIN reset_boundary rb
      WHERE ce.actor_user_id = ${input.userId}
        AND ce.type IN ('directions_opened', 'phone_clicked', 'whatsapp_opened')
        AND ce.occurred_at >= rb.starts_at
    ),
    signature_bars AS MATERIALIZED (
      SELECT b.amenities, b.screen_count, b.neighborhood
      FROM bar b
      JOIN positive_bar_ids positive ON positive.id = b.id
    ),
    signature_amenities AS MATERIALIZED (
      SELECT COALESCE(array_agg(DISTINCT amenity), '{}'::integer[]) AS values
      FROM signature_bars sb
      CROSS JOIN LATERAL unnest(sb.amenities) amenity
    ),
    signature_stats AS MATERIALIZED (
      SELECT
        AVG(sb.screen_count)::double precision AS screen_count,
        COALESCE(array_agg(DISTINCT sb.neighborhood), '{}'::text[]) AS neighborhoods
      FROM signature_bars sb
    ),
    negative_bars AS MATERIALIZED (
      SELECT b.amenities, b.neighborhood
      FROM bar_rating r
      JOIN bar b ON b.id = r.bar_id
      CROSS JOIN reset_boundary rb
      WHERE r.actor_user_id = ${input.userId}
        AND NOT r.would_return
        AND r.updated_at >= rb.starts_at
    ),
    negative_amenities AS MATERIALIZED (
      SELECT COALESCE(array_agg(DISTINCT amenity), '{}'::integer[]) AS values
      FROM negative_bars negative
      CROSS JOIN LATERAL unnest(negative.amenities) amenity
    ),
    negative_stats AS MATERIALIZED (
      SELECT COALESCE(array_agg(DISTINCT neighborhood), '{}'::text[]) AS neighborhoods
      FROM negative_bars
    ),
    eligible AS MATERIALIZED (
      SELECT
        b.*,
        ST_Distance(b.geo, p.origin) / 1000 AS distance_km
      FROM candidate_ids candidate
      JOIN bar b ON b.id = candidate.id
      CROSS JOIN params p
      CROSS JOIN reset_boundary rb
      WHERE b.is_active
        AND NOT EXISTS (
          SELECT 1 FROM user_favorite_bars favorite
          WHERE favorite.user_id = ${input.userId} AND favorite.bar_id = b.id
        )
        AND NOT EXISTS (
          SELECT 1 FROM recommendation_event re
          WHERE re.actor_user_id = ${input.userId}
            AND re.bar_id = b.id
            AND (
              (re.type = 'dismiss' AND re.occurred_at >= GREATEST(rb.starts_at, ${sixtyDaysAgo}::timestamptz))
              OR
              (re.type = 'unfavorite' AND re.occurred_at >= GREATEST(rb.starts_at, ${thirtyDaysAgo}::timestamptz))
            )
        )
        AND NOT EXISTS (
          SELECT 1 FROM bar_rating own_rating
          WHERE own_rating.actor_user_id = ${input.userId}
            AND own_rating.bar_id = b.id
            AND NOT own_rating.would_return
            AND own_rating.updated_at >= rb.starts_at
        )
    )
    SELECT
      eligible.id,
      eligible.name,
      eligible.neighborhood,
      eligible.city,
      eligible.latitude,
      eligible.longitude,
      eligible.photo_url,
      eligible.amenities,
      eligible.screen_count,
      eligible.distance_km,
      eligible.rating_count,
      eligible.rating_score,
      COALESCE(quality.recent_rating_count, 0)::int AS recent_rating_count,
      COALESCE(quality.recent_rating_positive, 0)::int AS recent_rating_positive,
      COALESCE(event_info.event_count, 0)::int AS event_count,
      COALESCE(event_info.sport_ids, '{}'::text[]) AS sport_ids,
      COALESCE(event_info.preferred_sport_match, false) AS preferred_sport_match,
      COALESCE(event_info.recent_sport_match, false) AS recent_sport_match,
      COALESCE(event_info.recent_team_match, false) AS recent_team_match,
      matched_sport.name AS matched_sport_name,
      next_event.id AS next_event_id,
      next_event.championship AS next_championship,
      next_event.starts_at AS next_event_starts_at,
      next_event.sport_id AS next_sport_id,
      next_event.sport_name AS next_sport_name,
      next_event.sport_slug AS next_sport_slug,
      signature_amenities.values AS signature_amenities,
      signature_stats.screen_count AS signature_screen_count,
      signature_stats.neighborhoods AS signature_neighborhoods,
      negative_amenities.values AS negative_amenities,
      negative_stats.neighborhoods AS negative_neighborhoods,
      COALESCE(intent.intent_actions, '[]'::jsonb) AS intent_actions
    FROM eligible
    CROSS JOIN signature_amenities
    CROSS JOIN signature_stats
    CROSS JOIN negative_amenities
    CROSS JOIN negative_stats
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*)::int AS recent_rating_count,
        COUNT(*) FILTER (WHERE r.would_return)::int AS recent_rating_positive
      FROM bar_rating r
      WHERE r.bar_id = eligible.id AND r.updated_at >= ${sixtyDaysAgo}
    ) quality ON true
    LEFT JOIN LATERAL (
      SELECT
        COUNT(DISTINCT e.id)::int AS event_count,
        array_agg(DISTINCT e.sport_id) AS sport_ids,
        bool_or(pref.sport_id IS NOT NULL) AS preferred_sport_match,
        bool_or(recent_sport.sport_id IS NOT NULL) AS recent_sport_match,
        bool_or(recent_team.team_id IS NOT NULL) AS recent_team_match
      FROM event e
      LEFT JOIN preferences pref ON pref.sport_id = e.sport_id
      LEFT JOIN recent_sports recent_sport ON recent_sport.sport_id = e.sport_id
      LEFT JOIN event_participants ep ON ep.event_id = e.id
      LEFT JOIN recent_teams recent_team ON recent_team.team_id = ep.team_id
      WHERE e.bar_id = eligible.id AND e.starts_at >= ${input.now}
    ) event_info ON true
    LEFT JOIN LATERAL (
      SELECT sport.name
      FROM event e
      JOIN sport ON sport.id = e.sport_id
      JOIN preferences pref ON pref.sport_id = e.sport_id
      WHERE e.bar_id = eligible.id AND e.starts_at >= ${input.now}
      ORDER BY e.starts_at, e.id
      LIMIT 1
    ) matched_sport ON true
    LEFT JOIN LATERAL (
      SELECT
        e.id,
        e.championship,
        e.starts_at,
        sport.id AS sport_id,
        sport.name AS sport_name,
        sport.slug AS sport_slug
      FROM event e
      JOIN sport ON sport.id = e.sport_id
      WHERE e.bar_id = eligible.id AND e.starts_at >= ${input.now}
      ORDER BY e.starts_at, e.id
      LIMIT 1
    ) next_event ON true
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(
        jsonb_build_object('kind', action.kind, 'occurredAt', action.occurred_at)
        ORDER BY action.occurred_at DESC
      ) AS intent_actions
      FROM (
        SELECT
          CASE
            WHEN ce.type IN ('directions_opened', 'phone_clicked', 'whatsapp_opened') THEN 'high_intent'
            WHEN ce.type = 'profile_view' AND ce.source_event_id IS NOT NULL THEN 'game_view'
            ELSE 'direct_view'
          END AS kind,
          ce.occurred_at
        FROM bar_commercial_event ce
        CROSS JOIN reset_boundary rb
        WHERE ce.actor_user_id = ${input.userId}
          AND ce.bar_id = eligible.id
          AND ce.occurred_at >= rb.starts_at
        UNION ALL
        SELECT 'positive_rating' AS kind, r.updated_at AS occurred_at
        FROM bar_rating r
        CROSS JOIN reset_boundary rb
        WHERE r.actor_user_id = ${input.userId}
          AND r.bar_id = eligible.id
          AND r.would_return
          AND r.updated_at >= rb.starts_at
      ) action
    ) intent ON true
    ORDER BY eligible.distance_km, eligible.id
  `)

  return (results.rows as CandidateRow[]).map((row) => {
    const amenities = row.amenities ?? []
    const signatureAmenities = row.signature_amenities ?? []
    const signatureScreenCount =
      row.signature_screen_count == null
        ? null
        : numeric(row.signature_screen_count)
    const screenSimilarity =
      row.screen_count == null || signatureScreenCount == null
        ? 0
        : Math.max(
            0,
            1 -
              Math.abs(row.screen_count - signatureScreenCount) /
                Math.max(1, signatureScreenCount)
          )

    return {
      id: row.id,
      name: row.name,
      neighborhood: row.neighborhood,
      city: row.city,
      latitude: row.latitude,
      longitude: row.longitude,
      photoUrl: row.photo_url,
      amenities,
      screenCount: row.screen_count,
      distanceKm: numeric(row.distance_km),
      eventCount: numeric(row.event_count),
      nextEvent:
        row.next_event_id &&
        row.next_championship &&
        row.next_event_starts_at &&
        row.next_sport_id &&
        row.next_sport_name &&
        row.next_sport_slug
          ? {
              id: row.next_event_id,
              championship: row.next_championship,
              startsAt: row.next_event_starts_at,
              sport: {
                id: row.next_sport_id,
                name: row.next_sport_name,
                slug: row.next_sport_slug
              }
            }
          : null,
      sportIds: row.sport_ids ?? [],
      ratingCount: numeric(row.rating_count),
      ratingScore: row.rating_score == null ? null : numeric(row.rating_score),
      recentRatingCount: numeric(row.recent_rating_count),
      recentRatingPositive: numeric(row.recent_rating_positive),
      preferredSportMatch: row.preferred_sport_match,
      recentSportMatch: row.recent_sport_match,
      recentTeamMatch: row.recent_team_match,
      hasUpcomingEvent: numeric(row.event_count) > 0,
      matchedSportName: row.matched_sport_name,
      amenitySimilarity: jaccard(amenities, signatureAmenities),
      screenSimilarity,
      neighborhoodSimilarity: (row.signature_neighborhoods ?? []).includes(
        row.neighborhood
      )
        ? 1
        : 0,
      negativeSimilarity: Math.max(
        jaccard(amenities, row.negative_amenities ?? []),
        (row.negative_neighborhoods ?? []).includes(row.neighborhood) ? 1 : 0
      ),
      intentActions: parseIntentActions(row.intent_actions)
    }
  })
}
