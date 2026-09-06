import { expect, test } from 'bun:test'
import { eq, inArray } from '@findsports_oficial/db'
import { barCommercialEvent } from '@findsports_oficial/db/schema/analytics'
import { user } from '@findsports_oficial/db/schema/auth'
import {
  bar,
  event,
  eventParticipants,
  sport,
  subscription,
  team
} from '@findsports_oficial/db/schema/platform'
import { isDisposableTestDatabase } from '@findsports_oficial/db/utils/db-resolver'

const integrationTest = isDisposableTestDatabase() ? test : test.skip

function pubContext(userId: string, now = new Date()) {
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
        name: 'Pub de integração',
        email: `${userId}@integration.invalid`,
        emailVerified: true,
        image: null,
        role: 'pub' as const,
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

      const caller = appRouter.createCaller(pubContext(userId, now))
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

integrationTest(
  'rejects teams from another sport and clears them when the sport changes',
  async () => {
    const [{ db }, { appRouter }] = await Promise.all([
      import('@findsports_oficial/db'),
      import('./index')
    ])
    const userId = crypto.randomUUID()
    const fanId = crypto.randomUUID()
    const barId = crypto.randomUUID()
    const firstSportId = crypto.randomUUID()
    const secondSportId = crypto.randomUUID()
    const firstTeamId = crypto.randomUUID()
    const secondTeamId = crypto.randomUUID()
    const now = new Date()

    await db.insert(user).values([
      {
        id: userId,
        name: 'Pub de integração',
        email: `${userId}@integration.invalid`,
        emailVerified: true,
        role: 'pub',
        onboardingCompleted: true
      },
      {
        id: fanId,
        name: 'Fan de integração',
        email: `${fanId}@integration.invalid`,
        emailVerified: true,
        role: 'fan',
        onboardingCompleted: true
      }
    ])

    try {
      await db.insert(sport).values([
        {
          id: firstSportId,
          name: `Esporte ${firstSportId}`,
          slug: `integration-${firstSportId}`
        },
        {
          id: secondSportId,
          name: `Esporte ${secondSportId}`,
          slug: `integration-${secondSportId}`
        }
      ])
      await db.insert(team).values([
        {
          id: firstTeamId,
          sportId: firstSportId,
          name: 'Time A',
          slug: `integration-${firstTeamId}`
        },
        {
          id: secondTeamId,
          sportId: secondSportId,
          name: 'Time B',
          slug: `integration-${secondTeamId}`
        }
      ])
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
        plan: 'pro',
        status: 'active',
        currentPeriodEnd: new Date(now.getTime() + 86_400_000)
      })
      const [existingEvent] = await db
        .insert(event)
        .values({
          barId,
          sportId: firstSportId,
          championship: 'Evento WEB-45',
          startsAt: new Date(now.getTime() + 86_400_000)
        })
        .returning({ id: event.id })
      if (!existingEvent) throw new Error('event insert returned no row')
      await db.insert(eventParticipants).values({
        eventId: existingEvent.id,
        teamId: firstTeamId
      })

      const caller = appRouter.createCaller(pubContext(userId, now))

      await expect(
        caller.pub.createEvent({
          sportId: firstSportId,
          championship: 'Create inválido',
          startsAt: new Date(now.getTime() + 172_800_000).toISOString(),
          participantIds: [secondTeamId]
        })
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
      expect(
        await db.query.event.findMany({ where: eq(event.barId, barId) })
      ).toHaveLength(1)

      await expect(
        caller.pub.updateEvent({
          eventId: existingEvent.id,
          participantIds: [secondTeamId]
        })
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
      expect(
        await db.query.eventParticipants.findMany({
          where: eq(eventParticipants.eventId, existingEvent.id)
        })
      ).toHaveLength(1)

      await caller.pub.updateEvent({
        eventId: existingEvent.id,
        sportId: secondSportId
      })
      const changed = await db.query.event.findFirst({
        where: eq(event.id, existingEvent.id),
        with: { participants: true }
      })
      expect(changed?.sportId).toBe(secondSportId)
      expect(changed?.participants).toHaveLength(0)

      const commercialDay = now.toISOString().slice(0, 10)
      await db.insert(barCommercialEvent).values([
        {
          barId,
          actorUserId: fanId,
          type: 'profile_view',
          occurredAt: now,
          commercialDay
        },
        {
          barId,
          actorUserId: fanId,
          type: 'profile_view',
          sourceEventId: existingEvent.id,
          sourceEventChampionship: 'Evento WEB-45',
          sourceEventStartsAt: changed?.startsAt ?? now,
          occurredAt: now,
          commercialDay
        }
      ])
      await expect(
        caller.pub.deleteEvent({ eventId: existingEvent.id })
      ).resolves.toEqual({ success: true })
      expect(
        await db.query.barCommercialEvent.findMany({
          where: eq(barCommercialEvent.barId, barId),
          columns: { sourceEventId: true }
        })
      ).toEqual(
        expect.arrayContaining([
          { sourceEventId: null },
          { sourceEventId: existingEvent.id }
        ])
      )
    } finally {
      await db.delete(user).where(inArray(user.id, [userId, fanId]))
      await db
        .delete(sport)
        .where(inArray(sport.id, [firstSportId, secondSportId]))
    }
  }
)

// WEB-43: updating only startsAt must not be able to push it past the
// persisted endsAt — the effective pair is validated on every update.
integrationTest(
  'rejects moving startsAt past the persisted endsAt and keeps the row intact',
  async () => {
    const [{ db }, { appRouter }] = await Promise.all([
      import('@findsports_oficial/db'),
      import('./index')
    ])
    const userId = crypto.randomUUID()
    const barId = crypto.randomUUID()
    const sportId = crypto.randomUUID()
    const now = new Date()
    const startsAt = new Date(now.getTime() + 86_400_000)
    const endsAt = new Date(startsAt.getTime() + 3_600_000)

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
      const [existingEvent] = await db
        .insert(event)
        .values({
          barId,
          sportId,
          championship: 'Evento WEB-43',
          startsAt,
          endsAt,
          participantFreeText: 'Brasil x Argentina'
        })
        .returning({ id: event.id })
      if (!existingEvent) {
        throw new Error('event insert returned no row')
      }

      const caller = appRouter.createCaller(pubContext(userId, now))

      const pastTheEnd = new Date(endsAt.getTime() + 3_600_000).toISOString()
      await expect(
        caller.pub.updateEvent({
          eventId: existingEvent.id,
          startsAt: pastTheEnd
        })
      ).rejects.toThrow()

      const untouched = await db.query.event.findFirst({
        where: eq(event.id, existingEvent.id)
      })
      expect(untouched?.startsAt?.getTime()).toBe(startsAt.getTime())
      expect(untouched?.endsAt?.getTime()).toBe(endsAt.getTime())

      // Control: an update that keeps the interval valid still succeeds.
      const withinTheRange = new Date(
        startsAt.getTime() + 1_800_000
      ).toISOString()
      await expect(
        caller.pub.updateEvent({
          eventId: existingEvent.id,
          startsAt: withinTheRange
        })
      ).resolves.toEqual({ success: true })
      const moved = await db.query.event.findFirst({
        where: eq(event.id, existingEvent.id)
      })
      expect(moved?.startsAt?.getTime()).toBe(
        new Date(withinTheRange).getTime()
      )
      expect(moved?.endsAt?.getTime()).toBe(endsAt.getTime())

      await caller.pub.updateEvent({
        eventId: existingEvent.id,
        participantFreeText: ''
      })
      const cleared = await db.query.event.findFirst({
        where: eq(event.id, existingEvent.id)
      })
      expect(cleared?.participantFreeText).toBeNull()
    } finally {
      await db.delete(user).where(eq(user.id, userId))
      await db.delete(sport).where(eq(sport.id, sportId))
    }
  }
)
