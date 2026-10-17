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
 * vão ao próximo jogo, com a inicial dos três que marcaram por último ("M R J
 * 34 vão"). As duas vêm junto da busca, depois do cache; a contagem só
 * aparece a partir do piso de "Vou assistir aqui", inclusive com o jogo já
 * começado, e "Aceita reserva" (10) não entra por ser derivada, não
 * declarada. A página do bar (`getById`) dá a mesma contagem ao ingresso.
 */
const integrationTest = isDisposableTestDatabase() ? test : test.skip

const ORIGIN_LAT = -34.75
const ORIGIN_LNG = -41.25

integrationTest(
  'busca e página do bar trazem características e "N vão" com iniciais a partir do piso',
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
    // Cada um com uma letra: A marcou primeiro, a última letra por último.
    const letter = (id: (typeof goers)[number]) =>
      String.fromCharCode(65 + goers.indexOf(id))
    const userIds = [fanId, ...goers, ...bars.map((item) => item.ownerId)]

    await db.insert(user).values(
      userIds.map((id) => ({
        id,
        name: goers.includes(id as (typeof goers)[number])
          ? `${letter(id as (typeof goers)[number])}ntônio ${id}`
          : `Pessoa ${id}`,
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
          // O cheio já começou: a contagem continua no card e no ingresso.
          startsAt: new Date(
            now.getTime() + (item.rotulo === 'cheio' ? -20 : 60) * 60_000
          )
        })
        await db.insert(attendance).values(
          goers.slice(0, item.going).map((userId, order) => ({
            userId,
            eventId: item.eventId,
            createdAt: new Date(now.getTime() - (100 - order) * 1000)
          }))
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

      const last = String.fromCharCode(64 + ATTENDANCE_DISPLAY_FLOOR)
      const recent = [
        last,
        String.fromCharCode(last.charCodeAt(0) - 1),
        String.fromCharCode(last.charCodeAt(0) - 2)
      ]

      expect(cheio?.goingCount).toBe(ATTENDANCE_DISPLAY_FLOOR)
      expect(cheio?.goingInitials).toEqual(recent)
      expect(cheio?.amenities).toEqual([1, 4])
      expect(vazio?.goingCount).toBeNull()
      expect(vazio?.goingInitials).toEqual([])
      expect(vazio?.amenities).toEqual([])

      const full = bars[0]
      if (!full) throw new Error('sem bar cheio')
      const profile = await caller.pubs.getById({ id: full.barId })
      const live = profile.events.find((game) => game.id === full.eventId)
      // O botão não cabe em jogo começado; a contagem, sim.
      expect(live?.attendance).toBeNull()
      expect(live?.going).toEqual({
        count: ATTENDANCE_DISPLAY_FLOOR,
        initials: recent
      })
    } finally {
      await db.delete(user).where(inArray(user.id, userIds))
      await db.delete(sport).where(inArray(sport.id, [sportId]))
    }
  }
)
