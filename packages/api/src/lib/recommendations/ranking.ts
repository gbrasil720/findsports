export const RECOMMENDATION_INTENT_KINDS = [
  'positive_rating',
  'high_intent',
  'game_view',
  'direct_view'
] as const
export type RecommendationIntentKind =
  (typeof RECOMMENDATION_INTENT_KINDS)[number]

export const RECOMMENDATION_REASONS = [
  'recent_interest',
  'preferred_sport',
  'similar_experience',
  'well_rated',
  'nearby',
  'explore'
] as const
export type RecommendationReason = (typeof RECOMMENDATION_REASONS)[number]

export const DAY_MS = 86_400_000
export const RECOMMENDATION_QUALITY_WINDOW_DAYS = 60
export const RECOMMENDATION_QUALITY_MIN_SAMPLE = 10
export const RECOMMENDATION_QUALITY_MIN_POSITIVE_RATE = 0.3
export const RECOMMENDATION_UNFAVORITE_COOLDOWN_DAYS = 30
/** "Passo" (o antigo "Não tenho interesse") tira o bar por 30 dias (dono, 21/10/2026). */
export const RECOMMENDATION_DISMISS_COOLDOWN_DAYS = 30

export type RecommendationIntentAction = {
  kind: RecommendationIntentKind
  occurredAt: Date
}

export type RecommendationEvent = {
  id: string
  championship: string
  startsAt: string
  sport: { id: string; name: string; slug: string }
}

export type RecommendationCandidate = {
  id: string
  name: string
  neighborhood: string
  city: string
  latitude: string
  longitude: string
  photoUrl: string | null
  amenities: number[]
  screenCount: number | null
  distanceKm: number
  eventCount: number
  nextEvent: RecommendationEvent | null
  sportIds: string[]
  ratingCount: number
  ratingScore: number | null
  recentRatingCount: number
  recentRatingPositive: number
  preferredSportMatch: boolean
  recentSportMatch: boolean
  recentTeamMatch: boolean
  hasUpcomingEvent: boolean
  matchedSportName: string | null
  amenitySimilarity: number
  screenSimilarity: number
  neighborhoodSimilarity: number
  negativeSimilarity: number
  intentActions: RecommendationIntentAction[]
}

export type RecommendationAxes = {
  directIntent: number
  sportsAffinity: number
  distance: number
  experienceSimilarity: number
  quality: number
}

export type ScoredRecommendation = {
  bar: RecommendationCandidate
  score: number
  axes: RecommendationAxes
  reason: RecommendationReason
  isExpandedRadius: boolean
}

type RankingContext = { now: Date; radiusKm: number }

const INTENT_POINTS: Record<RecommendationIntentKind, number> = {
  positive_rating: 30,
  high_intent: 25,
  game_view: 16,
  direct_view: 7
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}

export function recencyMultiplier(occurredAt: Date, now: Date): number {
  const utcDay = (value: Date) =>
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate())
  const ageDays = Math.max(
    0,
    Math.floor((utcDay(now) - utcDay(occurredAt)) / DAY_MS)
  )
  if (ageDays <= 7) return 1
  if (ageDays <= 21) return 0.7
  if (ageDays <= 45) return 0.4
  if (ageDays <= 60) return 0.15
  return 0
}

export function isQualityProtected(
  recentRatingCount: number,
  recentRatingPositive: number
): boolean {
  return (
    recentRatingCount >= RECOMMENDATION_QUALITY_MIN_SAMPLE &&
    recentRatingPositive / recentRatingCount <
      RECOMMENDATION_QUALITY_MIN_POSITIVE_RATE
  )
}

function directIntentScore(
  actions: RecommendationIntentAction[],
  now: Date
): number {
  const values = actions
    .map(
      (action) =>
        INTENT_POINTS[action.kind] * recencyMultiplier(action.occurredAt, now)
    )
    .filter((value) => value > 0)
    .sort((first, second) => second - first)

  if (values.length === 0) return 0
  const score = values.reduce((total, value, index) => {
    if (index === 0) return value
    if (index === 1) return total + value * 0.25
    return total + value * 0.1
  }, 0)
  return round(clamp(score, 0, 30))
}

function sportsAffinityScore(candidate: RecommendationCandidate): number {
  const score =
    (candidate.preferredSportMatch ? 12 : 0) +
    (candidate.recentSportMatch ? 5 : 0) +
    (candidate.recentTeamMatch ? 3 : 0) +
    (candidate.hasUpcomingEvent ? 2 : 0)
  return clamp(score, 0, 20)
}

function distanceScore(distanceKm: number, radiusKm: number): number {
  if (radiusKm <= 0 || distanceKm < 0) return 0
  if (distanceKm <= radiusKm) {
    return round(15 - 5 * (distanceKm / radiusKm))
  }
  const maximumDistance = radiusKm * 1.5
  if (distanceKm >= maximumDistance) return 0
  return round(
    10 * (1 - (distanceKm - radiusKm) / (maximumDistance - radiusKm))
  )
}

function experienceSimilarityScore(candidate: RecommendationCandidate): number {
  return round(
    clamp(
      clamp(candidate.amenitySimilarity, 0, 1) * 10 +
        clamp(candidate.screenSimilarity, 0, 1) * 5 +
        clamp(candidate.neighborhoodSimilarity, 0, 1) * 3 -
        clamp(candidate.negativeSimilarity, 0, 1) * 3,
      0,
      18
    )
  )
}

function qualityScore(candidate: RecommendationCandidate): number {
  if (candidate.ratingCount < 5 || candidate.ratingScore == null) return 8.5
  return round(clamp(candidate.ratingScore, 0, 1) * 17)
}

function dominantReason(axes: RecommendationAxes): RecommendationReason {
  if (axes.directIntent >= 7) return 'recent_interest'
  if (axes.sportsAffinity >= 12) return 'preferred_sport'
  if (axes.experienceSimilarity >= 8) return 'similar_experience'
  if (axes.quality >= 11) return 'well_rated'
  if (axes.distance >= 10) return 'nearby'
  return 'explore'
}

export function scoreRecommendationCandidate(
  candidate: RecommendationCandidate,
  context: RankingContext
): ScoredRecommendation {
  const axes: RecommendationAxes = {
    directIntent: directIntentScore(candidate.intentActions, context.now),
    sportsAffinity: sportsAffinityScore(candidate),
    distance: distanceScore(candidate.distanceKm, context.radiusKm),
    experienceSimilarity: experienceSimilarityScore(candidate),
    quality: qualityScore(candidate)
  }

  return {
    bar: candidate,
    score: round(
      Object.values(axes).reduce((total, value) => total + value, 0)
    ),
    axes,
    reason: dominantReason(axes),
    isExpandedRadius: candidate.distanceKm > context.radiusKm
  }
}

export function jaccard<T>(first: T[], second: T[]): number {
  const a = new Set(first)
  const b = new Set(second)
  const union = new Set([...a, ...b])
  if (union.size === 0) return 0
  let intersection = 0
  for (const value of a) if (b.has(value)) intersection += 1
  return intersection / union.size
}

function diversity(
  candidate: RecommendationCandidate,
  selected: RecommendationCandidate[]
): number {
  if (selected.length === 0) return 1
  const similarity = Math.max(
    ...selected.map(
      (other) =>
        (candidate.neighborhood === other.neighborhood ? 0.3 : 0) +
        jaccard(candidate.amenities, other.amenities) * 0.4 +
        jaccard(candidate.sportIds, other.sportIds) * 0.3
    )
  )
  return clamp(1 - similarity, 0, 1)
}

function pickDiversified(
  candidates: ScoredRecommendation[],
  selected: ScoredRecommendation[],
  relevanceWeight: number
): ScoredRecommendation | undefined {
  return [...candidates].sort((first, second) => {
    const firstValue =
      (first.score / 100) * relevanceWeight +
      diversity(
        first.bar,
        selected.map((item) => item.bar)
      ) *
        (1 - relevanceWeight)
    const secondValue =
      (second.score / 100) * relevanceWeight +
      diversity(
        second.bar,
        selected.map((item) => item.bar)
      ) *
        (1 - relevanceWeight)
    return secondValue - firstValue || first.bar.id.localeCompare(second.bar.id)
  })[0]
}

/**
 * As posições da rodada (22e): 1 "Sua cara" é a maior nota; 2 "Pra variar"
 * pesa 85% relevância e 15% diferença; 3 "Vale arriscar", 65% e 35%, só entre
 * quem tem ao menos 70% da nota do primeiro. A rodada do app tem cinco (dono,
 * 21/10/2026): a 4 repete a regra da 2 e a 5 a da 3, com o mesmo piso.
 */
export const RECOMMENDATION_SLOTS = [
  { slot: 'sua_cara', relevance: 1, floor: false },
  { slot: 'pra_variar', relevance: 0.85, floor: false },
  { slot: 'vale_arriscar', relevance: 0.65, floor: true },
  { slot: 'pra_variar', relevance: 0.85, floor: false },
  { slot: 'vale_arriscar', relevance: 0.65, floor: true }
] as const
export type RecommendationSlot = (typeof RECOMMENDATION_SLOTS)[number]['slot']
export const RECOMMENDATION_MAX_COUNT = RECOMMENDATION_SLOTS.length

export type RankedRecommendation = ScoredRecommendation & {
  slot: RecommendationSlot
}

/** `count` é 3 no perfil do web e 5 na rodada do app. */
export function rankRecommendations(
  candidates: RecommendationCandidate[],
  context: RankingContext,
  count = 3
): RankedRecommendation[] {
  const scored = candidates
    .filter(
      (candidate) =>
        !isQualityProtected(
          candidate.recentRatingCount,
          candidate.recentRatingPositive
        )
    )
    .map((candidate) => scoreRecommendationCandidate(candidate, context))
    .sort(
      (first, second) =>
        second.score - first.score || first.bar.id.localeCompare(second.bar.id)
    )

  const first = scored[0]
  if (!first) return []
  const selected: RankedRecommendation[] = [{ ...first, slot: 'sua_cara' }]
  let remaining = scored.slice(1)

  for (const rule of RECOMMENDATION_SLOTS.slice(1, count)) {
    if (remaining.length === 0) break
    const aboveFloor = rule.floor
      ? remaining.filter((item) => item.score >= first.score * 0.7)
      : remaining
    const next = pickDiversified(
      aboveFloor.length > 0 ? aboveFloor : remaining,
      selected,
      rule.relevance
    )
    if (!next) break
    selected.push({ ...next, slot: rule.slot })
    remaining = remaining.filter((item) => item.bar.id !== next.bar.id)
  }

  return selected
}
