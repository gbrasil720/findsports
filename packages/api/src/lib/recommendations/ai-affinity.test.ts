import { describe, expect, test } from 'bun:test'

import { type AiBinding, getAiBinding, setAiBinding } from '../ai/binding'
import { RECOMMENDER_MODELS } from '../ai/models'
import {
  type AffinityProfile,
  AI_AFFINITY_CANDIDATES,
  affinityCandidates,
  buildAffinityRequest,
  readAffinity,
  requestAffinity
} from './ai-affinity'
import { type RecommendationCandidate, rankRecommendations } from './ranking'

const NOW = new Date('2026-11-12T12:00:00.000Z')

function bar(
  id: string,
  overrides: Partial<RecommendationCandidate> = {}
): RecommendationCandidate {
  return {
    id,
    name: `Bar secreto ${id}`,
    neighborhood: 'Pinheiros',
    city: 'São Paulo',
    latitude: '-23.56',
    longitude: '-46.68',
    photoUrl: null,
    amenities: [1, 13],
    screenCount: 2,
    distanceKm: 1,
    eventCount: 1,
    nextEvent: {
      id: 'e1',
      championship: 'Brasileirão',
      startsAt: '2026-11-12T22:00:00.000Z',
      sport: { id: 's1', name: 'Futebol', slug: 'futebol' }
    },
    sportIds: ['s1'],
    ratingCount: 0,
    ratingScore: null,
    recentRatingCount: 0,
    recentRatingPositive: 0,
    preferredSportMatch: false,
    recentSportMatch: false,
    recentTeamMatch: false,
    hasUpcomingEvent: true,
    matchedSportName: null,
    amenitySimilarity: 0,
    screenSimilarity: 0,
    neighborhoodSimilarity: 0,
    negativeSimilarity: 0,
    intentActions: [],
    ...overrides
  }
}

const profile: AffinityProfile = {
  sports: ['Futebol'],
  teams: ['Corinthians'],
  likedAmenities: [1, 4],
  likedNeighborhoods: ['Pinheiros'],
  dislikedAmenities: [19]
}

/** O modelo dublado: responde o que `answer` mandar, contando as chamadas. */
function dubla(answer: (model: string, questions: string[]) => unknown) {
  const calls: string[] = []
  const ai: AiBinding = {
    async run(model, input) {
      calls.push(model)
      return answer(model, Object.keys(input.questions as object))
    }
  }
  setAiBinding(ai)
  return calls
}

async function callThroughBinding(
  model: string,
  input: Record<string, unknown>
) {
  const binding = await getAiBinding()
  if (!binding) throw new Error('sem binding')
  return binding.run(model, input)
}

describe('affinity request', () => {
  test('sends the same request to both models, without ids or names', () => {
    const bars = [{ candidate: bar('uuid-1'), description: 'x'.repeat(500) }]
    const jev = buildAffinityRequest(RECOMMENDER_MODELS.b, profile, bars)
    const clef = buildAffinityRequest(RECOMMENDER_MODELS.c, profile, bars)

    expect(clef.input).toEqual({ ...jev.input, model: 'clef-flash' })
    expect(jev.keys).toEqual(['uuid-1'])
    const text = JSON.stringify(jev.input)
    expect(text).not.toContain('uuid-1')
    expect(text).not.toContain('Bar secreto')
    expect(text).toContain('Telão / projetor')
    expect(text).toContain(`"${'x'.repeat(300)}"`)
    expect(text).not.toContain('x'.repeat(301))
    expect(jev.input.questions).toEqual({
      b1: expect.objectContaining({
        type: 'score',
        criteria: expect.any(Array)
      })
    })
  })

  test('takes the control top 15, without quality-protected bars', () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      bar(`b${String(i).padStart(2, '0')}`, { distanceKm: i * 0.1 })
    )
    many.push(
      bar('bad', {
        distanceKm: 0,
        recentRatingCount: 10,
        recentRatingPositive: 0
      })
    )
    const top = affinityCandidates(many, { now: NOW, radiusKm: 3 })
    expect(top).toHaveLength(AI_AFFINITY_CANDIDATES)
    expect(top[0]?.id).toBe('b00')
    expect(top.map((item) => item.id)).not.toContain('bad')
  })
})

describe('affinity answer', () => {
  test('reads Clef and Jev shapes and maps 0..4 to 0..1', () => {
    expect(
      readAffinity({ answers: { b1: { type: 'score', score: 4 }, b2: 1 } }, [
        'x',
        'y'
      ])
    ).toEqual(
      new Map([
        ['x', 1],
        ['y', 0.25]
      ])
    )
    expect(
      readAffinity({ result: { answers: { b1: { score: 2 } } } }, ['x'])
    ).toEqual(new Map([['x', 0.5]]))
  })

  test('drops missing, broken and out-of-range answers', () => {
    const affinity = readAffinity(
      { answers: { b1: { score: 5 }, b2: { score: 'alto' }, b4: -1 } },
      ['a', 'b', 'c', 'd']
    )
    expect(affinity.size).toBe(0)
    expect(readAffinity(null, ['a']).size).toBe(0)
    expect(readAffinity('texto', ['a']).size).toBe(0)
  })

  test('a bar left out by the model keeps the rule score', async () => {
    dubla(() => ({ answers: { b1: { score: 0 } } }))
    const ruled = bar('ruled', { amenitySimilarity: 1, screenSimilarity: 1 })
    const other = bar('other', { distanceKm: 1.1 })
    const result = await requestAffinity(
      callThroughBinding,
      RECOMMENDER_MODELS.b,
      profile,
      [{ candidate: other }, { candidate: ruled }]
    )
    expect(result.status).toBe('ok')
    const ranked = rankRecommendations([ruled, other], {
      now: NOW,
      radiusKm: 3,
      affinity: result.affinity ?? undefined
    })
    expect(ranked[0]?.bar.id).toBe('ruled')
    expect(ranked[0]?.axes.experienceSimilarity).toBe(15)
    expect(ranked[1]?.axes.experienceSimilarity).toBe(0)
  })
})

describe('affinity failure rule', () => {
  const bars = [{ candidate: bar('a') }]

  test('retries the same model once, then routes to the other', async () => {
    const calls = dubla((model) => {
      if (model === RECOMMENDER_MODELS.b) throw new Error('2021: falha')
      return { answers: { b1: { score: 3 } } }
    })
    const result = await requestAffinity(
      callThroughBinding,
      RECOMMENDER_MODELS.b,
      profile,
      bars
    )
    expect(calls).toEqual([
      RECOMMENDER_MODELS.b,
      RECOMMENDER_MODELS.b,
      RECOMMENDER_MODELS.c
    ])
    expect(result).toEqual({
      affinity: new Map([['a', 0.75]]),
      status: 'fallback',
      servedModel: RECOMMENDER_MODELS.c,
      calls: 3
    })
  })

  test('an empty answer counts as failure; both failing is control', async () => {
    const calls = dubla(() => ({ answers: {} }))
    const result = await requestAffinity(
      callThroughBinding,
      RECOMMENDER_MODELS.c,
      profile,
      bars
    )
    expect(calls).toHaveLength(3)
    expect(result.status).toBe('error')
    expect(result.affinity).toBeNull()
  })

  test('the second try on the same model is still "ok"', async () => {
    let first = true
    dubla(() => {
      if (first) {
        first = false
        throw new Error('timeout')
      }
      return { result: { answers: { b1: { score: 1 } } } }
    })
    const result = await requestAffinity(
      callThroughBinding,
      RECOMMENDER_MODELS.b,
      profile,
      bars
    )
    expect(result.status).toBe('ok')
    expect(result.servedModel).toBe(RECOMMENDER_MODELS.b)
    expect(result.calls).toBe(2)
  })
})
