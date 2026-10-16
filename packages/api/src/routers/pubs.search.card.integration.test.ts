import { expect, test } from 'bun:test'
import { inArray } from '@findsports_oficial/db'
import { attendance } from '@findsports_oficial/db/schema/attendance'
import { user } from '@findsports_oficial/db/schema/auth'
import {
  bar,
  event,
  sport,
  subscription
} from '@findsports_oficial/db/schema/platform'
import { isDisposableTestDatabase } from '@findsports_oficial/db/utils/db-resolver'
import { ATTENDANCE_DISPLAY_FLOOR } from '../lib/attendance'
import { contextFor, load } from './integration-seed'

/**
 * O card do bar no app (07 do design) mostra as características e quantos
 * vão ao próximo jogo. As duas vêm junto da busca, depois do cache; a
 * contagem só aparece a partir do piso de "Vou assistir aqui", e "Aceita
 * reserva" (10) não entra por ser derivada, não declarada.
 */
const integrationTest = isDisposableTestDatabase() ? test : test.skip

const ORIGIN_LAT = -34.75
const ORIGIN_LNG = -41.25

integrationTest(
  'busca traz características declaradas e "N vão" a partir do piso',
  async () => {
    const { db, appRouter } = await load()
    const fanId = crypto.randomUUID()
    const sportId = crypto.randomUUID()
    const now = new Date()
    const bars = [
      {
        rotulo: 'cheio',
        going: ATTENDANCE_DISPLAY_FLOOR,
        amenities: [1, 4, 10]
      },
      { rotulo: 'vazio', going: ATTENDANCE_DISPLAY_FLOOR - 1, amenities: [] }
    ].map((fixture, index) => ({
      ...fixture,
      offset: 0.001 * (index + 1),
      barId: crypto.randomUUID(),
      ownerId: crypto.randomUUID(),
      eventId: crypto.randomUUID()
    }))
    const goers = Array.from({ length: ATTENDANCE_DISPLAY_FLOOR }, () =>
      crypto.randomUUID()
    )
    const userIds = [fanId, ...goers, ...bars.map((item) => item.ownerId)]

    await db.insert(user).values(
      userIds.map((id) => ({
        id,
        name: `Pessoa ${id}`,
        email: `${id}@integration.invalid`,
        emailVerified: true,
        role: bars.some((item) => item.ownerId === id)
          ? ('pub' as const)
          : ('fan' as const),
        onboardingCompleted: true
      }))
    )

    try {
      await db.insert(sport).values({
        id: sportId,
        name: `Esporte ${sportId}`,
        slug: `card-integration-${sportId}`
      })
      for (const item of bars) {
        await db.insert(bar).values({
          id: item.barId,
          userId: item.ownerId,
          name: `Bar ${item.rotulo}`,
          address: 'Rua descartável, 1',
          neighborhood: 'Teste',
          city: 'Teste',
          latitude: (ORIGIN_LAT + item.offset).toFixed(8),
          longitude: ORIGIN_LNG.toFixed(8),
          amenities: item.amenities,
          isActive: true
        })
        await db.insert(subscription).values({
          barId: item.barId,
          plan: 'starter',
          status: 'active'
        })
        await db.insert(event).values({
          id: item.eventId,
          barId: item.barId,
          sportId,
          championship: `Jogo ${item.barId}`,
          startsAt: new Date(now.getTime() + 60 * 60_000)
        })
        await db
          .insert(attendance)
          .values(
            goers
              .slice(0, item.going)
              .map((userId) => ({ userId, eventId: item.eventId }))
          )
      }

      const caller = appRouter.createCaller(contextFor(fanId, 'fan', now))
      const page = await caller.pubs.search({
        lat: ORIGIN_LAT,
        lng: ORIGIN_LNG,
        radiusKm: 3,
        limit: 20
      })
      const byId = new Map(page.bars.map((found) => [found.id, found]))
      const [cheio, vazio] = bars.map((item) => byId.get(item.barId))

      expect(cheio?.goingCount).toBe(ATTENDANCE_DISPLAY_FLOOR)
      expect(cheio?.amenities).toEqual([1, 4])
      expect(vazio?.goingCount).toBeNull()
      expect(vazio?.amenities).toEqual([])
    } finally {
      await db.delete(user).where(inArray(user.id, userIds))
      await db.delete(sport).where(inArray(sport.id, [sportId]))
    }
  }
)
