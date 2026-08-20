import { expect, test } from 'bun:test'
import { eq, inArray } from 'drizzle-orm'

function isDisposableLoadDatabase(url: string | undefined): boolean {
  if (!url || process.env.RUN_DISPOSABLE_DB_TESTS !== '1') return false
  try {
    const parsed = new URL(url)
    return (
      ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname) &&
      parsed.pathname === '/findsports_load_test'
    )
  } catch {
    return false
  }
}

const integrationTest = isDisposableLoadDatabase(
  process.env.LOAD_TEST_DATABASE_URL
)
  ? test
  : test.skip

integrationTest(
  'loads only active, non-favorite bars and ranks the onboarding sport',
  async () => {
    const [
      { db },
      authSchema,
      platformSchema,
      { loadRecommendationCandidates },
      { rankRecommendations }
    ] = await Promise.all([
      import('@findsports_oficial/db'),
      import('@findsports_oficial/db/schema/auth'),
      import('@findsports_oficial/db/schema/platform'),
      import('./load-candidates'),
      import('./ranking')
    ])
    const schema = { ...authSchema, ...platformSchema }

    const fanId = crypto.randomUUID()
    const ownerIds: [string, string, string] = [
      crypto.randomUUID(),
      crypto.randomUUID(),
      crypto.randomUUID()
    ]
    const sportId = crypto.randomUUID()
    const candidateId = crypto.randomUUID()
    const favoriteId = crypto.randomUUID()
    const inactiveId = crypto.randomUUID()
    const eventId = crypto.randomUUID()
    const origin = { lat: -31.5, lng: -41.5 }
    const now = new Date()

    await db.insert(schema.user).values([
      {
        id: fanId,
        name: 'Torcedor de recomendações',
        email: `${fanId}@integration.invalid`,
        emailVerified: true,
        role: 'fan',
        onboardingCompleted: true,
        searchRadiusKm: 3
      },
      ...ownerIds.map((id) => ({
        id,
        name: `Dono ${id}`,
        email: `${id}@integration.invalid`,
        emailVerified: true,
        role: 'pub' as const,
        onboardingCompleted: true
      }))
    ])

    try {
      await db.insert(schema.sport).values({
        id: sportId,
        name: 'Esporte de recomendação',
        slug: `recommendation-${sportId}`
      })
      await db.insert(schema.userPreferenceSports).values({
        userId: fanId,
        sportId
      })
      await db.insert(schema.bar).values([
        {
          id: candidateId,
          userId: ownerIds[0],
          name: 'Candidato elegível',
          address: 'Rua Teste, 1',
          neighborhood: 'Teste A',
          city: 'Teste',
          latitude: (origin.lat + 0.001).toFixed(8),
          longitude: origin.lng.toFixed(8),
          isActive: true
        },
        {
          id: favoriteId,
          userId: ownerIds[1],
          name: 'Favorito excluído',
          address: 'Rua Teste, 2',
          neighborhood: 'Teste B',
          city: 'Teste',
          latitude: (origin.lat + 0.002).toFixed(8),
          longitude: origin.lng.toFixed(8),
          isActive: true
        },
        {
          id: inactiveId,
          userId: ownerIds[2],
          name: 'Sem assinatura ativa',
          address: 'Rua Teste, 3',
          neighborhood: 'Teste C',
          city: 'Teste',
          latitude: (origin.lat + 0.003).toFixed(8),
          longitude: origin.lng.toFixed(8),
          isActive: false
        }
      ])
      await db.insert(schema.userFavoriteBars).values({
        userId: fanId,
        barId: favoriteId
      })
      await db.insert(schema.event).values({
        id: eventId,
        barId: candidateId,
        sportId,
        championship: 'Copa de recomendação',
        startsAt: new Date(now.getTime() + 86_400_000)
      })

      const candidates = await loadRecommendationCandidates({
        userId: fanId,
        ...origin,
        radiusKm: 3,
        now
      })
      expect(candidates.map((item) => item.id)).toEqual([candidateId])

      const ranked = rankRecommendations(candidates, { now, radiusKm: 3 })
      expect(ranked[0]?.reason).toBe('preferred_sport')
      expect(ranked[0]?.bar.matchedSportName).toBe('Esporte de recomendação')
    } finally {
      await db
        .delete(schema.user)
        .where(inArray(schema.user.id, [fanId, ...ownerIds]))
      await db.delete(schema.sport).where(eq(schema.sport.id, sportId))
    }
  }
)
