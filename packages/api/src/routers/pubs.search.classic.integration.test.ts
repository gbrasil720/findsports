import { expect, test } from 'bun:test'
import { eq, inArray, sql } from '@findsports_oficial/db'
import {
  barCommercialDailyRollup,
  barCommercialEvent
} from '@findsports_oficial/db/schema/analytics'
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

const ORIGIN_LAT = -39.5
const ORIGIN_LNG = -37.5

integrationTest(
  'coloca Elite clássico no topo, pagina sem repetir e mantém a exceção de rating',
  async () => {
    const [{ db }, { appRouter }, { resetAppConfig, setAppConfig }] =
      await Promise.all([
        import('@findsports_oficial/db'),
        import('./index'),
        import('../lib/app-config')
      ])

    const now = new Date()
    const fanId = crypto.randomUUID()
    const raterIds = Array.from({ length: 3 }, () => crypto.randomUUID())
    const sportId = crypto.randomUUID()
    const teamIds = {
      flamengo: crypto.randomUUID(),
      palmeiras: crypto.randomUUID()
    }
    const fixtures = [
      {
        label: 'elite-classic',
        plan: 'elite' as const,
        offset: 0.001,
        minutes: 30
      },
      {
        label: 'elite-classic-tie',
        plan: 'elite' as const,
        offset: 0.001,
        minutes: 30
      },
      {
        label: 'elite-other',
        plan: 'elite' as const,
        offset: 0.002,
        minutes: 10
      },
      { label: 'pro-classic', plan: 'pro' as const, offset: 0.003, minutes: 5 },
      {
        label: 'starter-classic',
        plan: 'starter' as const,
        offset: 0.004,
        minutes: 1
      }
    ].map((fixture) => ({
      ...fixture,
      barId: crypto.randomUUID(),
      ownerId: crypto.randomUUID(),
      eventId: crypto.randomUUID()
    }))
    const ownerIds = fixtures.map((fixture) => fixture.ownerId)
    const byLabel = new Map(fixtures.map((fixture) => [fixture.label, fixture]))
    const eliteClassic = byLabel.get('elite-classic')
    const eliteClassicTie = byLabel.get('elite-classic-tie')
    const eliteOther = byLabel.get('elite-other')
    const proClassic = byLabel.get('pro-classic')
    if (!eliteClassic || !eliteClassicTie || !eliteOther || !proClassic)
      throw new Error('fixtures incompletas')
    const expectedOrder = [eliteClassic, eliteClassicTie]
      .sort((left, right) => left.barId.localeCompare(right.barId))
      .concat(
        [eliteOther, proClassic, byLabel.get('starter-classic')].map(
          (fixture, index) => {
            if (fixture) return fixture
            const label = ['elite-other', 'pro-classic', 'starter-classic'][
              index
            ]
            throw new Error(`fixture ausente: ${label}`)
          }
        )
      )
      .map((fixture) => fixture.barId)

    await db.insert(user).values([
      {
        id: fanId,
        name: 'Torcedor de clássico',
        email: `${fanId}@integration.invalid`,
        emailVerified: true,
        role: 'fan',
        onboardingCompleted: true
      },
      ...raterIds.map((id) => ({
        id,
        name: `Avaliador ${id}`,
        email: `${id}@integration.invalid`,
        emailVerified: true,
        role: 'fan' as const,
        onboardingCompleted: true
      })),
      ...fixtures.map((fixture) => ({
        id: fixture.ownerId,
        name: `Dono ${fixture.label}`,
        email: `${fixture.ownerId}@integration.invalid`,
        emailVerified: true,
        role: 'pub' as const,
        onboardingCompleted: true
      }))
    ])

    try {
      await db.insert(sport).values({
        id: sportId,
        name: `Futebol ${sportId}`,
        slug: `classic-search-${sportId}`
      })
      await db
        .insert(team)
        .values([
          {
            id: teamIds.flamengo,
            sportId,
            name: 'Flamengo',
            slug: 'flamengo',
            country: 'BR'
          },
          {
            id: teamIds.palmeiras,
            sportId,
            name: 'Palmeiras',
            slug: 'palmeiras',
            country: 'BR'
          }
        ])
        .onConflictDoNothing()

      const teams = await db.query.team.findMany({
        where: (table, operators) =>
          operators.inArray(table.slug, ['flamengo', 'palmeiras']),
        columns: { id: true, slug: true }
      })
      const teamBySlug = new Map(teams.map((item) => [item.slug, item.id]))
      const flamengoId = teamBySlug.get('flamengo')
      const palmeirasId = teamBySlug.get('palmeiras')
      if (!flamengoId || !palmeirasId)
        throw new Error('times do clássico ausentes')

      for (const fixture of fixtures) {
        await db.insert(bar).values({
          id: fixture.barId,
          userId: fixture.ownerId,
          name: `Bar ${fixture.label}`,
          address: 'Rua descartável, 1',
          neighborhood: 'Teste',
          city: 'Teste',
          latitude: (ORIGIN_LAT + fixture.offset).toFixed(8),
          longitude: ORIGIN_LNG.toFixed(8),
          isActive: true
        })
        await db.insert(subscription).values({
          barId: fixture.barId,
          plan: fixture.plan,
          status: 'active'
        })
        await db.insert(event).values({
          id: fixture.eventId,
          barId: fixture.barId,
          sportId,
          championship:
            fixture.label === 'elite-other' ? 'Liga comum' : 'Brasileirão',
          startsAt: new Date(now.getTime() + fixture.minutes * 60_000)
        })
      }

      for (const fixture of fixtures.filter(
        (item) => item.label !== 'elite-other'
      )) {
        await db.insert(eventParticipants).values([
          { eventId: fixture.eventId, teamId: flamengoId },
          { eventId: fixture.eventId, teamId: palmeirasId }
        ])
      }

      for (const raterId of raterIds) {
        await db.execute(sql`
          INSERT INTO bar_rating
            (id, bar_id, actor_user_id, event_id, would_return)
          VALUES
            (${crypto.randomUUID()}, ${proClassic.barId}, ${raterId}, ${proClassic.eventId}, true)
        `)
      }

      await setAppConfig('rating.public_display', true, null)

      const caller = appRouter.createCaller({
        auth: null,
        clientIp: '127.0.0.1',
        session: {
          session: {
            id: crypto.randomUUID(),
            token: crypto.randomUUID(),
            userId: fanId,
            createdAt: now,
            updatedAt: now,
            expiresAt: new Date(now.getTime() + 3_600_000),
            ipAddress: null,
            userAgent: null
          },
          user: {
            id: fanId,
            name: 'Torcedor de clássico',
            email: `${fanId}@integration.invalid`,
            emailVerified: true,
            image: null,
            role: 'fan',
            banned: false,
            onboardingCompleted: true,
            searchRadiusKm: 3,
            twoFactorEnabled: false,
            createdAt: now,
            updatedAt: now
          }
        }
      })

      const relevance = await caller.pubs.search({
        lat: ORIGIN_LAT,
        lng: ORIGIN_LNG,
        radiusKm: 3,
        limit: 20
      })
      expect(relevance.bars.map((item) => item.id)).toEqual(expectedOrder)
      expect(relevance.bars[0]?.nextEvent?.classic).toEqual({
        reason: 'Flamengo x Palmeiras: rivalidade editorial',
        ruleVersion: 1
      })
      expect(relevance.bars.slice(0, 2).map((item) => item.id)).toEqual(
        expectedOrder.slice(0, 2)
      )

      const ticker = await caller.pubs.getEliteEvents()
      const ourTicker = ticker.filter(
        (item) =>
          String(item.bar_id) === eliteClassic.barId ||
          String(item.bar_id) === eliteOther.barId
      )
      expect(ourTicker.map((item) => item.event_id)).toEqual([
        eliteClassic.eventId,
        eliteOther.eventId
      ])
      expect(ourTicker[0]?.classic_reason).toBe(
        'Flamengo x Palmeiras: rivalidade editorial'
      )

      const location = await caller.pubs.searchByLocation({
        lat: ORIGIN_LAT + 0.006,
        lng: ORIGIN_LNG,
        radiusKm: 3,
        limit: 20
      })
      const locationIds = location.bars.map((item) => item.id)
      expect(locationIds.indexOf(proClassic.barId)).toBeLessThan(
        locationIds.indexOf(eliteClassic.barId)
      )

      await caller.commercialAnalytics.recordCommercialEvent({
        pubId: eliteClassic.barId,
        type: 'classic_exposure',
        sourceEventId: eliteClassic.eventId
      })
      await caller.commercialAnalytics.recordCommercialEvent({
        pubId: eliteClassic.barId,
        type: 'classic_click',
        sourceEventId: eliteClassic.eventId
      })
      await expect(
        caller.commercialAnalytics.recordCommercialEvent({
          pubId: proClassic.barId,
          type: 'classic_click',
          sourceEventId: proClassic.eventId
        })
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' })

      const measurements = await db
        .select({
          type: barCommercialEvent.type,
          ruleVersion: barCommercialEvent.classicRuleVersion,
          reason: barCommercialEvent.classicRuleReason
        })
        .from(barCommercialEvent)
        .where(eq(barCommercialEvent.barId, eliteClassic.barId))
        .orderBy(sql`type DESC`)
      expect(measurements).toEqual([
        {
          type: 'classic_exposure',
          ruleVersion: 1,
          reason: 'Flamengo x Palmeiras: rivalidade editorial'
        },
        {
          type: 'classic_click',
          ruleVersion: 1,
          reason: 'Flamengo x Palmeiras: rivalidade editorial'
        }
      ])
      const [rollup] = await db
        .select({
          exposures: barCommercialDailyRollup.classicExposures,
          clicks: barCommercialDailyRollup.classicClicks
        })
        .from(barCommercialDailyRollup)
        .where(eq(barCommercialDailyRollup.barId, eliteClassic.barId))
      expect(rollup).toEqual({ exposures: 1, clicks: 1 })

      const visited: string[] = []
      let cursor: string | undefined
      for (let index = 0; index < fixtures.length + 1; index += 1) {
        const page = await caller.pubs.search({
          lat: ORIGIN_LAT,
          lng: ORIGIN_LNG,
          radiusKm: 3,
          limit: 1,
          cursor
        })
        visited.push(...page.bars.map((item) => item.id))
        if (!page.nextCursor) break
        cursor = page.nextCursor
      }
      expect(visited).toEqual(expectedOrder)
      expect(new Set(visited).size).toBe(visited.length)

      const rating = await caller.pubs.search({
        lat: ORIGIN_LAT,
        lng: ORIGIN_LNG + 0.01,
        radiusKm: 3,
        sort: 'rating',
        limit: 20
      })
      expect(rating.bars[0]?.id).toBe(proClassic.barId)
    } finally {
      await resetAppConfig('rating.public_display')
      await db
        .delete(user)
        .where(inArray(user.id, [fanId, ...raterIds, ...ownerIds]))
      await db.delete(sport).where(eq(sport.id, sportId))
    }
  }
)
