import { expect, test } from 'bun:test'
import { user } from '@findsports_oficial/db/schema/auth'
import {
  bar,
  event,
  sport,
  subscription
} from '@findsports_oficial/db/schema/platform'
import { eq } from 'drizzle-orm'

function isClearlyDisposableDatabase(url: string | undefined): boolean {
  if (!url || process.env.RUN_DISPOSABLE_DB_TESTS !== '1') return false
  try {
    const parsed = new URL(url)
    const database = parsed.pathname.replace(/^\//, '')
    return (
      ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname) &&
      /(test|testing|tmp|temp|disposable|ci)/i.test(database)
    )
  } catch {
    return false
  }
}

const integrationTest = isClearlyDisposableDatabase(process.env.DATABASE_URL)
  ? test
  : test.skip

integrationTest(
  'serializes concurrent Starter creates at the five-event limit',
  async () => {
    const [{ db }, { appRouter }] = await Promise.all([
      import('@findsports_oficial/db'),
      import('./index')
    ])
    const userId = crypto.randomUUID()
    const barId = crypto.randomUUID()
    const sportId = crypto.randomUUID()
    const now = new Date()
    const currentPeriodEnd = new Date(now)
    currentPeriodEnd.setUTCMonth(currentPeriodEnd.getUTCMonth() + 1)

    await db.insert(user).values({
      id: userId,
      name: 'Pub de integração',
      email: `${userId}@integration.invalid`,
      emailVerified: true,
      role: 'pub',
      onboardingCompleted: true
    })

    try {
      await db.insert(sport).values({
        id: sportId,
        name: `Esporte ${sportId}`,
        slug: `integration-${sportId}`
      })
      await db.insert(bar).values({
        id: barId,
        userId,
        name: 'Pub de integração',
        address: 'Rua descartável, 1',
        neighborhood: 'Teste',
        city: 'Teste',
        latitude: '-23.55052000',
        longitude: '-46.63330800',
        isActive: true
      })
      await db.insert(subscription).values({
        barId,
        plan: 'starter',
        status: 'active',
        currentPeriodEnd
      })
      await db.insert(event).values(
        Array.from({ length: 4 }, (_, index) => ({
          barId,
          sportId,
          championship: `Evento existente ${index + 1}`,
          startsAt: new Date(now.getTime() + index * 60_000)
        }))
      )

      const caller = appRouter.createCaller({
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
            name: 'Pub de integração',
            email: `${userId}@integration.invalid`,
            emailVerified: true,
            image: null,
            role: 'pub',
            banned: false,
            onboardingCompleted: true,
            searchRadiusKm: 3,
            createdAt: now,
            updatedAt: now
          }
        }
      })
      const startsAt = new Date(now.getTime() + 86_400_000).toISOString()
      const results = await Promise.allSettled([
        caller.pub.createEvent({
          sportId,
          championship: 'Create concorrente A',
          startsAt
        }),
        caller.pub.createEvent({
          sportId,
          championship: 'Create concorrente B',
          startsAt
        })
      ])

      expect(
        results.filter((result) => result.status === 'fulfilled')
      ).toHaveLength(1)
      expect(
        results.filter((result) => result.status === 'rejected')
      ).toHaveLength(1)
      const finalEvents = await db.query.event.findMany({
        where: eq(event.barId, barId)
      })
      expect(finalEvents).toHaveLength(5)
      const policy = await caller.pub.getMyEventCreationPolicy()
      expect(policy).toMatchObject({
        status: 'limited',
        canCreate: false,
        used: 5,
        remaining: 0
      })
    } finally {
      await db.delete(user).where(eq(user.id, userId))
      await db.delete(sport).where(eq(sport.id, sportId))
    }
  }
)
