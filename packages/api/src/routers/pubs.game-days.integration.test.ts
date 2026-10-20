import { expect, test } from 'bun:test'
import { inArray } from '@findsports_oficial/db'
import { user } from '@findsports_oficial/db/schema/auth'
import { bar, event, sport } from '@findsports_oficial/db/schema/platform'
import { isDisposableTestDatabase } from '@findsports_oficial/db/utils/db-resolver'
import { contextFor, load } from './integration-seed'

/**
 * `pubs.gameDays`, o "Quando" dos filtros do app (19d): jogos por dia de
 * Brasília, nos próximos sete dias, nos bares no ar do raio.
 */
const integrationTest = isDisposableTestDatabase() ? test : test.skip

const DAY = 86_400_000
// Um ponto isolado no mar, longe de qualquer bar de outros testes.
const ORIGIN = { lat: -28.4, lng: -47.3 }
const KM_IN_LAT = 1 / 111
const TELAO = 1

integrationTest(
  'conta jogos por dia no raio, com esporte e características da busca',
  async () => {
    const { db, appRouter } = await load()
    const futebol = crypto.randomUUID()
    const basquete = crypto.randomUUID()
    const today = new Date().toLocaleDateString('en-CA', {
      timeZone: 'America/Sao_Paulo'
    })
    // Meio-dia de Brasília do dia `n` a partir de hoje.
    const noon = (n: number) =>
      new Date(new Date(`${today}T15:00:00Z`).getTime() + n * DAY)
    const bars = [
      {
        key: 'telao',
        km: 0.5,
        active: true,
        amenities: [TELAO],
        games: [
          { day: 0, sport: futebol },
          { day: 0, sport: basquete },
          { day: 1, sport: futebol }
        ]
      },
      {
        key: 'simples',
        km: 1,
        active: true,
        amenities: [],
        games: [
          { day: 0, sport: futebol },
          // Fora dos sete dias.
          { day: 8, sport: futebol }
        ]
      },
      // Fora do ar e longe: não contam.
      {
        key: 'fora',
        km: 0.5,
        active: false,
        amenities: [],
        games: [{ day: 0, sport: futebol }]
      },
      {
        key: 'longe',
        km: 30,
        active: true,
        amenities: [],
        games: [{ day: 0, sport: futebol }]
      }
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
      await db.insert(sport).values([
        { id: futebol, name: `Esporte ${futebol}`, slug: `days-${futebol}` },
        { id: basquete, name: `Esporte ${basquete}`, slug: `days-${basquete}` }
      ])
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
          isActive: b.active,
          amenities: b.amenities
        }))
      )
      await db.insert(event).values(
        bars.flatMap((b) =>
          b.games.map((game) => ({
            id: crypto.randomUUID(),
            barId: b.barId,
            sportId: game.sport,
            championship: 'Campeonato de teste',
            participantFreeText: `Jogo ${b.key}`,
            startsAt: noon(game.day)
          }))
        )
      )

      const fan = appRouter.createCaller(contextFor(crypto.randomUUID(), 'fan'))
      const counts = async (input: {
        sportId?: string
        amenities?: number[]
      }) =>
        (await fan.pubs.gameDays({ ...ORIGIN, radiusKm: 3, ...input })).map(
          (d) => d.games
        )

      const days = await fan.pubs.gameDays({ ...ORIGIN, radiusKm: 3 })
      expect(days).toHaveLength(7)
      expect(days[0]?.day).toBe(today)
      expect(await counts({})).toEqual([3, 1, 0, 0, 0, 0, 0])
      expect(await counts({ sportId: futebol })).toEqual([2, 1, 0, 0, 0, 0, 0])
      expect(await counts({ amenities: [TELAO] })).toEqual([
        2, 1, 0, 0, 0, 0, 0
      ])
    } finally {
      await db.delete(user).where(
        inArray(
          user.id,
          bars.map((b) => b.userId)
        )
      )
      await db.delete(sport).where(inArray(sport.id, [futebol, basquete]))
    }
  }
)
