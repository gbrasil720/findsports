import { expect, test } from 'bun:test'
import { and, eq, inArray } from '@findsports_oficial/db'
import { barCommercialEvent } from '@findsports_oficial/db/schema/analytics'
import { user } from '@findsports_oficial/db/schema/auth'
import { bar, event, sport } from '@findsports_oficial/db/schema/platform'
import { isDisposableTestDatabase } from '@findsports_oficial/db/utils/db-resolver'
import { TRPCError } from '@trpc/server'

const integrationTest = isDisposableTestDatabase() ? test : test.skip

function fanContext(userId: string, now = new Date()) {
  return {
    auth: null,
    clientIp: '127.0.0.1',
    session: {
      session: {
        id: crypto.randomUUID(),
        token: crypto.randomUUID(),
        userId,
        createdAt: now,
        updatedAt: now,
        expiresAt: new Date(now.getTime() + 3_600_000),
        ipAddress: null,
        userAgent: null
      },
      user: {
        id: userId,
        name: 'Fan de integração',
        email: `${userId}@integration.invalid`,
        emailVerified: true,
        image: null,
        role: 'fan' as const,
        banned: false,
        onboardingCompleted: true,
        searchRadiusKm: 3,
        twoFactorEnabled: false,
        createdAt: now,
        updatedAt: now
      }
    }
  }
}

integrationTest(
  'WEB-96: serializa registros paralelos e não aceita o 31º evento na janela',
  async () => {
    const [{ db }, { appRouter }] = await Promise.all([
      import('@findsports_oficial/db'),
      import('./index')
    ])
    const fanUserId = crypto.randomUUID()
    const pubUserId = crypto.randomUUID()
    const barId = crypto.randomUUID()
    const sportId = crypto.randomUUID()
    const now = new Date()

    await db.insert(user).values([
      {
        id: fanUserId,
        name: 'Fan de integração',
        email: `${fanUserId}@integration.invalid`,
        emailVerified: true,
        role: 'fan',
        onboardingCompleted: true
      },
      {
        id: pubUserId,
        name: 'Pub de integração',
        email: `${pubUserId}@integration.invalid`,
        emailVerified: true,
        role: 'pub',
        onboardingCompleted: true
      }
    ])

    try {
      await db.insert(sport).values({
        id: sportId,
        name: `Esporte ${sportId}`,
        slug: `integration-${sportId}`
      })
      await db.insert(bar).values({
        id: barId,
        userId: pubUserId,
        name: 'Pub de integração',
        address: 'Rua descartável, 1',
        neighborhood: 'Teste',
        city: 'Teste',
        latitude: '-23.55052000',
        longitude: '-46.63330800',
        isActive: true
      })

      // Mais de 30 combinações deduplicáveis de tipo/jogo: cada jogo é um
      // `source_event_id` distinto, então nenhuma das 31 chamadas empata na
      // deduplicação diária — só o rate limit por minuto pode barrar.
      const sourceEvents = Array.from({ length: 31 }, (_, index) => ({
        id: crypto.randomUUID(),
        barId,
        sportId,
        championship: `Jogo ${index + 1}`,
        startsAt: new Date(now.getTime() + index * 60_000)
      }))
      await db.insert(event).values(sourceEvents)

      const caller = appRouter.createCaller(fanContext(fanUserId, now))
      const results = await Promise.allSettled(
        sourceEvents.map((ev) =>
          caller.commercialAnalytics.recordCommercialEvent({
            pubId: barId,
            type: 'profile_view',
            sourceEventId: ev.id
          })
        )
      )

      const fulfilled = results.filter((r) => r.status === 'fulfilled')
      const rejected = results.filter(
        (r): r is PromiseRejectedResult => r.status === 'rejected'
      )

      expect(fulfilled).toHaveLength(30)
      expect(rejected).toHaveLength(1)
      const reason = rejected[0]?.reason
      expect(reason).toBeInstanceOf(TRPCError)
      expect((reason as TRPCError).code).toBe('TOO_MANY_REQUESTS')

      const stored = await db
        .select()
        .from(barCommercialEvent)
        .where(
          and(
            eq(barCommercialEvent.actorUserId, fanUserId),
            eq(barCommercialEvent.barId, barId)
          )
        )
      expect(stored).toHaveLength(30)
    } finally {
      await db.delete(user).where(inArray(user.id, [fanUserId, pubUserId]))
      await db.delete(sport).where(eq(sport.id, sportId))
    }
  }
)
