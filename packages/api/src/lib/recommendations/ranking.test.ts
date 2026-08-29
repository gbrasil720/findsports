import { describe, expect, test } from 'bun:test'

import {
  isQualityProtected,
  type RecommendationCandidate,
  rankRecommendations,
  recencyMultiplier,
  scoreRecommendationCandidate
} from './ranking'

const NOW = new Date('2026-08-20T12:00:00.000Z')

function candidate(
  id: string,
  overrides: Partial<RecommendationCandidate> = {}
): RecommendationCandidate {
  return {
    id,
    name: `Bar ${id}`,
    neighborhood: 'Centro',
    city: 'São Paulo',
    latitude: '-23.55000000',
    longitude: '-46.63000000',
    photoUrl: null,
    amenities: [],
    screenCount: null,
    distanceKm: 1,
    eventCount: 0,
    nextEvent: null,
    sportIds: [],
    ratingCount: 0,
    ratingScore: null,
    recentRatingCount: 0,
    recentRatingPositive: 0,
    preferredSportMatch: false,
    recentSportMatch: false,
    recentTeamMatch: false,
    hasUpcomingEvent: false,
    matchedSportName: null,
    amenitySimilarity: 0,
    screenSimilarity: 0,
    neighborhoodSimilarity: 0,
    negativeSimilarity: 0,
    intentActions: [],
    ...overrides
  }
}

describe('recommendation recency', () => {
  test('uses the approved 7/21/45/60 day curve', () => {
    const daysAgo = (days: number) =>
      new Date(NOW.getTime() - days * 86_400_000)

    expect(recencyMultiplier(daysAgo(7), NOW)).toBe(1)
    expect(recencyMultiplier(daysAgo(8), NOW)).toBe(0.7)
    expect(recencyMultiplier(daysAgo(22), NOW)).toBe(0.4)
    expect(recencyMultiplier(daysAgo(46), NOW)).toBe(0.15)
    expect(recencyMultiplier(daysAgo(61), NOW)).toBe(0)
  })

  test('does not change weight during the same UTC day', () => {
    const occurredAt = new Date('2026-08-13T23:59:00.000Z')
    expect(
      recencyMultiplier(occurredAt, new Date('2026-08-20T00:01:00.000Z'))
    ).toBe(recencyMultiplier(occurredAt, new Date('2026-08-20T23:59:00.000Z')))
  })
})

describe('recommendation quality protection', () => {
  test('requires ten recent ratings and less than thirty percent positive', () => {
    expect(isQualityProtected(9, 0)).toBe(false)
    expect(isQualityProtected(10, 2)).toBe(true)
    expect(isQualityProtected(10, 3)).toBe(false)
  })
})

describe('recommendation score', () => {
  test('uses the approved 30/20/15/18/17 axis caps', () => {
    const result = scoreRecommendationCandidate(
      candidate('complete', {
        distanceKm: 0,
        preferredSportMatch: true,
        recentSportMatch: true,
        recentTeamMatch: true,
        hasUpcomingEvent: true,
        amenitySimilarity: 1,
        screenSimilarity: 1,
        neighborhoodSimilarity: 1,
        ratingCount: 100,
        ratingScore: 1,
        intentActions: [
          { kind: 'positive_rating', occurredAt: NOW },
          { kind: 'high_intent', occurredAt: NOW }
        ]
      }),
      { now: NOW, radiusKm: 3 }
    )

    expect(result.axes).toEqual({
      directIntent: 30,
      sportsAffinity: 20,
      distance: 15,
      experienceSimilarity: 18,
      quality: 17
    })
    expect(result.score).toBe(100)
  })

  test('gives unrated bars neutral quality instead of zero', () => {
    const result = scoreRecommendationCandidate(candidate('new'), {
      now: NOW,
      radiusKm: 3
    })

    expect(result.axes.quality).toBe(8.5)
  })

  test('values a game-sourced view above a direct profile view', () => {
    const gameView = scoreRecommendationCandidate(
      candidate('game', {
        intentActions: [{ kind: 'game_view', occurredAt: NOW }]
      }),
      { now: NOW, radiusKm: 3 }
    )
    const directView = scoreRecommendationCandidate(
      candidate('direct', {
        intentActions: [{ kind: 'direct_view', occurredAt: NOW }]
      }),
      { now: NOW, radiusKm: 3 }
    )

    expect(gameView.axes.directIntent).toBeGreaterThan(
      directView.axes.directIntent
    )
  })

  test('marks candidates outside the configured radius', () => {
    const result = scoreRecommendationCandidate(
      candidate('expanded', { distanceKm: 4 }),
      { now: NOW, radiusKm: 3 }
    )

    expect(result.isExpandedRadius).toBe(true)
    expect(result.axes.distance).toBeGreaterThan(0)
  })

  test('applies only a light similarity penalty after a negative rating', () => {
    const positive = scoreRecommendationCandidate(
      candidate('positive-signature', {
        amenitySimilarity: 1,
        screenSimilarity: 1,
        neighborhoodSimilarity: 1
      }),
      { now: NOW, radiusKm: 3 }
    )
    const negative = scoreRecommendationCandidate(
      candidate('negative-signature', {
        amenitySimilarity: 1,
        screenSimilarity: 1,
        neighborhoodSimilarity: 1,
        negativeSimilarity: 1
      }),
      { now: NOW, radiusKm: 3 }
    )

    expect(positive.axes.experienceSimilarity).toBe(18)
    expect(negative.axes.experienceSimilarity).toBe(15)
  })
})

describe('recommendation reranking', () => {
  test('keeps the best result first and diversifies later slots', () => {
    const ranked = rankRecommendations(
      [
        candidate('best', {
          neighborhood: 'Centro',
          amenities: [1, 2],
          sportIds: ['football'],
          intentActions: [{ kind: 'positive_rating', occurredAt: NOW }]
        }),
        candidate('clone', {
          neighborhood: 'Centro',
          amenities: [1, 2],
          sportIds: ['football'],
          intentActions: [{ kind: 'high_intent', occurredAt: NOW }]
        }),
        candidate('different', {
          neighborhood: 'Pinheiros',
          amenities: [4, 5],
          sportIds: ['basketball'],
          preferredSportMatch: true,
          hasUpcomingEvent: true,
          ratingCount: 20,
          ratingScore: 0.8
        })
      ],
      { now: NOW, radiusKm: 3 }
    )

    expect(ranked[0]?.bar.id).toBe('best')
    expect(ranked.map((item) => item.bar.id)).toContain('different')
  })

  test('is deterministic when scores tie', () => {
    const input = [candidate('b'), candidate('a'), candidate('c')]
    const first = rankRecommendations(input, { now: NOW, radiusKm: 3 })
    const second = rankRecommendations([...input].reverse(), {
      now: NOW,
      radiusKm: 3
    })

    expect(first.map((item) => item.bar.id)).toEqual(
      second.map((item) => item.bar.id)
    )
  })
})
