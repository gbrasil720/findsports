import { expect, test } from 'bun:test'
import { inArray } from '@findsports_oficial/db'
import { user } from '@findsports_oficial/db/schema/auth'
import {
  bar,
  event,
  sport,
  subscription
} from '@findsports_oficial/db/schema/platform'
import { isDisposableTestDatabase } from '@findsports_oficial/db/utils/db-resolver'
import { contextFor, load } from './integration-seed'

/**
 * Jogo em andamento continua na busca.
 *
 * A busca filtrava `starts_at >= NOW()`: o bar cujo único jogo tinha acabado
 * de começar sumia do resultado, justo quando o torcedor está saindo de casa.
 * A regra agora é a do perfil público — o jogo vale até o fim derivado
 * (`ends_at`, ou início mais a duração padrão) — nos três caminhos: camadas,
 * linear e ordenação por nota.
 */
const integrationTest = isDisposableTestDatabase() ? test : test.skip

/** Origem isolada das outras suítes de busca. */
const ORIGIN_LAT = -28.5
const ORIGIN_LNG = -48.25
const MINUTE = 60_000
const HOUR = 60 * MINUTE

integrationTest(
  'a busca devolve o jogo em andamento e descarta o que já acabou',
  async () => {
    const [{ db, appRouter }, { resetAppConfig, setAppConfig }] =
      await Promise.all([load(), import('../lib/app-config')])

    const fanId = crypto.randomUUID()
    const sportId = crypto.randomUUID()
    const now = new Date()
    const at = (offsetMs: number) => new Date(now.getTime() + offsetMs)

    const fixtures = [
      // Começou há 10 minutos, sem fim informado: ainda rola.
      { key: 'aoVivo', startsAt: at(-10 * MINUTE), endsAt: null, shown: true },
      // Começou há 4 horas, sem fim informado: a duração padrão já passou.
      { key: 'acabou', startsAt: at(-4 * HOUR), endsAt: null, shown: false },
      // Começou há 4 horas, mas o bar informou um fim daqui a 1 hora.
      {
        key: 'longo',
        startsAt: at(-4 * HOUR),
        endsAt: at(1 * HOUR),
        shown: true
      },
      // Começou há 10 minutos e o bar informou que já terminou.
      {
        key: 'curto',
        startsAt: at(-10 * MINUTE),
        endsAt: at(-5 * MINUTE),
        shown: false
      }
    ].map((fixture, index) => ({
      ...fixture,
      barId: crypto.randomUUID(),
      ownerId: crypto.randomUUID(),
      offset: 0.001 * (index + 1)
    }))
    const esperados = fixtures
      .filter((fixture) => fixture.shown)
      .map((fixture) => fixture.barId)
      .sort()

    await db.insert(user).values([
      {
        id: fanId,
        name: 'Torcedor de integração',
        email: `${fanId}@integration.invalid`,
        emailVerified: true,
        role: 'fan',
        onboardingCompleted: true
      },
      ...fixtures.map((fixture) => ({
        id: fixture.ownerId,
        name: `Dono ${fixture.ownerId}`,
        email: `${fixture.ownerId}@integration.invalid`,
        emailVerified: true,
        role: 'pub' as const,
        onboardingCompleted: true
      }))
    ])

    try {
      await db.insert(sport).values({
        id: sportId,
        name: `Esporte ${sportId}`,
        slug: `live-integration-${sportId}`
      })
      for (const fixture of fixtures) {
        await db.insert(bar).values({
          id: fixture.barId,
          userId: fixture.ownerId,
          name: `Bar ${fixture.key} ${fixture.barId}`,
          address: 'Rua descartável, 1',
          neighborhood: 'Teste',
          city: 'Teste',
          latitude: (ORIGIN_LAT + fixture.offset).toFixed(8),
          longitude: ORIGIN_LNG.toFixed(8),
          isActive: true
        })
        await db
          .insert(subscription)
          .values({ barId: fixture.barId, plan: 'starter', status: 'active' })
        await db.insert(event).values({
          barId: fixture.barId,
          sportId,
          championship: `Jogo ${fixture.key}`,
          startsAt: fixture.startsAt,
          endsAt: fixture.endsAt
        })
      }

      const caller = appRouter.createCaller(contextFor(fanId, 'fan', now))
      const buscar = (sort: 'relevance' | 'rating') =>
        caller.pubs.search({
          lat: ORIGIN_LAT,
          lng: ORIGIN_LNG,
          radiusKm: 3,
          limit: 20,
          sort
        })
      const conferir = async (sort: 'relevance' | 'rating') => {
        const pagina = await buscar(sort)
        expect(pagina.bars.map((achado) => achado.id).sort()).toEqual(esperados)
        for (const achado of pagina.bars) {
          expect(achado.event_count).toBe(1)
          expect(achado.nextEvent).toBeDefined()
        }
        const longo = pagina.bars.find(
          (achado) => achado.id === fixtures[2]?.barId
        )
        expect(longo?.nextEvent?.endsAt).toBe(
          fixtures[2]?.endsAt?.toISOString() ?? null
        )
        const aoVivo = pagina.bars.find(
          (achado) => achado.id === fixtures[0]?.barId
        )
        expect(aoVivo?.nextEvent?.endsAt).toBeNull()
      }

      await setAppConfig('search.tiered_plan_query', true, null)
      await conferir('relevance')
      await conferir('rating')

      await setAppConfig('search.tiered_plan_query', false, null)
      await conferir('relevance')
    } finally {
      await resetAppConfig('search.tiered_plan_query')
      await db
        .delete(user)
        .where(
          inArray(user.id, [
            fanId,
            ...fixtures.map((fixture) => fixture.ownerId)
          ])
        )
      await db.delete(sport).where(inArray(sport.id, [sportId]))
    }
  }
)
