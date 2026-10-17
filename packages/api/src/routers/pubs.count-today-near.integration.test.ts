import { expect, test } from 'bun:test'
import { inArray } from '@findsports_oficial/db'
import { user } from '@findsports_oficial/db/schema/auth'
import { bar, event, sport } from '@findsports_oficial/db/schema/platform'
import { isDisposableTestDatabase } from '@findsports_oficial/db/utils/db-resolver'
import { contextFor, load } from './integration-seed'

/**
 * `pubs.countTodayNear`, o "N bares com jogo hoje" do onboarding do app:
 * conta só bar no ar, dentro do raio e com jogo hoje (dia de Brasília).
 */
const integrationTest = isDisposableTestDatabase() ? test : test.skip

const HOUR = 3_600_000
// Um ponto isolado no mar, longe de qualquer bar de outros testes.
const ORIGIN = { lat: -27.9, lng: -47.8 }
const KM_IN_LAT = 1 / 111

integrationTest(
  'conta bares no ar, no raio e com jogo hoje, cada um uma vez',
  async () => {
    const { db, appRouter } = await load()
    const sportId = crypto.randomUUID()
    const now = new Date()
    const bars = [
      // Dentro de 1 km, com dois jogos hoje: conta uma vez.
      { key: 'perto', km: 0.5, active: true, when: [now, now] },
      // A 2 km: só entra no raio de 3.
      { key: 'medio', km: 2, active: true, when: [now] },
      // Fora do ar: não conta.
      { key: 'fora', km: 0.5, active: false, when: [now] },
      // Jogo só amanhã: não conta.
      {
        key: 'amanha',
        km: 0.5,
        active: true,
        when: [new Date(now.getTime() + 26 * HOUR)]
      },
      // Longe: fora até do raio de 10.
      { key: 'longe', km: 30, active: true, when: [now] }
    ].map((spec) => ({
      ...spec,
      userId: crypto.randomUUID(),
      barId: crypto.randomUUID()
    }))

    await db.insert(user).values(
      bars.map((b) => ({
        id: b.userId,
        name: `Dono ${b.key}`,
        email: `${b.userId}@integration.invalid`,
        emailVerified: true,
        role: 'pub' as const,
        onboardingCompleted: true
      }))
    )
    try {
      await db.insert(sport).values({
        id: sportId,
        name: `Esporte ${sportId}`,
        slug: `near-${sportId}`
      })
      await db.insert(bar).values(
        bars.map((b) => ({
          id: b.barId,
          userId: b.userId,
          name: `Bar ${b.key}`,
          address: 'Rua descartável, 1',
          neighborhood: 'Teste',
          city: 'Teste',
          latitude: (ORIGIN.lat + b.km * KM_IN_LAT).toFixed(8),
          longitude: ORIGIN.lng.toFixed(8),
          isActive: b.active
        }))
      )
      await db.insert(event).values(
        bars.flatMap((b) =>
          b.when.map((startsAt) => ({
            id: crypto.randomUUID(),
            barId: b.barId,
            sportId,
            championship: 'Campeonato de teste',
            participantFreeText: `Jogo ${b.key}`,
            startsAt
          }))
        )
      )

      const fan = appRouter.createCaller(contextFor(crypto.randomUUID(), 'fan'))
      const count = (radiusKm: 1 | 3 | 5 | 10) =>
        fan.pubs.countTodayNear({ ...ORIGIN, radiusKm })

      expect(await count(1)).toEqual({ bars: 1 })
      expect(await count(3)).toEqual({ bars: 2 })
      expect(await count(10)).toEqual({ bars: 2 })
    } finally {
      await db.delete(user).where(
        inArray(
          user.id,
          bars.map((b) => b.userId)
        )
      )
      await db.delete(sport).where(inArray(sport.id, [sportId]))
    }
  }
)
