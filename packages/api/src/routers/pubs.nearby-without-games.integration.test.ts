import { expect, test } from 'bun:test'
import { inArray } from '@findsports_oficial/db'
import { user } from '@findsports_oficial/db/schema/auth'
import { bar, event, sport } from '@findsports_oficial/db/schema/platform'
import { isDisposableTestDatabase } from '@findsports_oficial/db/utils/db-resolver'
import { resetAppConfig, setAppConfig } from '../lib/app-config'
import { contextFor, load } from './integration-seed'

/**
 * `pubs.nearbyWithoutGames`, o complemento da lista do Explorar do app: bar
 * no ar, no raio e sem jogo que ainda não acabou, do mais perto ao mais longe.
 */
const integrationTest = isDisposableTestDatabase() ? test : test.skip

const HOUR = 3_600_000
// Um ponto isolado no mar, longe de qualquer bar de outros testes.
const ORIGIN = { lat: -28.4, lng: -46.9 }
const KM_IN_LAT = 1 / 111

integrationTest(
  'lista bares no ar, no raio e sem jogo pela frente',
  async () => {
    const { db, appRouter } = await load()
    const sportId = crypto.randomUUID()
    const now = Date.now()
    const bars = [
      // Sem jogo nenhum, a 2 km e a 0,5 km: entram, o mais perto primeiro.
      { key: 'vazio-longe', km: 2, active: true, when: [] },
      { key: 'vazio-perto', km: 0.5, active: true, when: [] },
      // Só jogo que já acabou: entra.
      {
        key: 'passado',
        km: 1,
        active: true,
        when: [new Date(now - 48 * HOUR)]
      },
      // Jogo amanhã: já está na busca, não entra.
      {
        key: 'amanha',
        km: 0.7,
        active: true,
        when: [new Date(now + 26 * HOUR)]
      },
      // Fora do ar: não entra.
      { key: 'fora', km: 0.5, active: false, when: [] },
      // Fora do raio de 3 km.
      { key: 'longe', km: 6, active: true, when: [] }
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
        slug: `nearby-${sportId}`
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
          isActive: b.active,
          // Nota acima do piso, para conferir a exibição pública.
          ...(b.key === 'vazio-perto'
            ? { ratingCount: 5, ratingPositive: 4 }
            : {})
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
      const found = await fan.pubs.nearbyWithoutGames({
        ...ORIGIN,
        radiusKm: 3
      })

      expect(found.map((b) => b.name)).toEqual([
        'Bar vazio-perto',
        'Bar passado',
        'Bar vazio-longe'
      ])
      expect(found[0]?.nextEvent).toBeUndefined()
      expect(found[0]?.distance_km).toBeCloseTo(0.5, 1)

      // A nota pública segue a flag na hora, como na busca.
      await setAppConfig('rating.public_display', true, null)
      const comNota = await fan.pubs.nearbyWithoutGames({
        ...ORIGIN,
        radiusKm: 3
      })
      expect(comNota[0]?.rating?.percentage).toBe(80)
      await setAppConfig('rating.public_display', false, null)
      const semNota = await fan.pubs.nearbyWithoutGames({
        ...ORIGIN,
        radiusKm: 3
      })
      expect(semNota[0]?.rating).toBeNull()
    } finally {
      await resetAppConfig('rating.public_display')
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
