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
 * Oferta por jogo (WEB-422) no filtro "Com oferta da casa": ele olha o jogo
 * que casa com a busca. O bar entra pelo próximo jogo com oferta (a dele ou a
 * padrão do bar), e é esse jogo que o card mostra; "sem oferta neste jogo"
 * tira o jogo, não o bar. Bar sem jogo usa a padrão.
 */
const integrationTest = isDisposableTestDatabase() ? test : test.skip

integrationTest(
  'filtro "Com oferta da casa" olha a oferta de cada jogo, nos três caminhos',
  async () => {
    const [{ db, appRouter }, { resetAppConfig, setAppConfig }] =
      await Promise.all([load(), import('../lib/app-config')])

    const lat = -37.5
    const lng = -44.5
    const fanId = crypto.randomUUID()
    const sportId = crypto.randomUUID()
    const now = new Date()
    const em = (horas: number) => new Date(now.getTime() + horas * 3_600_000)

    type Jogo = { horas: number; houseOffer?: string; noHouseOffer?: boolean }
    const casos: {
      rotulo: string
      oferta: string | null
      plano: 'elite' | 'pro'
      jogos: Jogo[]
    }[] = [
      {
        rotulo: 'herda',
        oferta: 'Chopp',
        plano: 'elite',
        jogos: [{ horas: 1 }]
      },
      {
        rotulo: 'só no jogo',
        oferta: null,
        plano: 'elite',
        jogos: [{ horas: 1, houseOffer: 'Porção grátis' }]
      },
      {
        rotulo: 'sem oferta no jogo',
        oferta: 'Chopp',
        plano: 'elite',
        jogos: [{ horas: 1, noHouseOffer: true }]
      },
      {
        rotulo: 'sem no próximo, com no seguinte',
        oferta: 'Chopp',
        plano: 'elite',
        jogos: [{ horas: 1, noHouseOffer: true }, { horas: 3 }]
      },
      {
        rotulo: 'Pro com oferta no jogo',
        oferta: null,
        plano: 'pro',
        jogos: [{ horas: 1, houseOffer: 'Porção grátis' }]
      },
      {
        rotulo: 'sem jogo, com padrão',
        oferta: 'Chopp',
        plano: 'elite',
        jogos: []
      },
      {
        rotulo: 'sem jogo, sem padrão',
        oferta: null,
        plano: 'elite',
        jogos: []
      }
    ]
    const fixtures = casos.map((caso, index) => ({
      ...caso,
      offset: (index + 1) * 0.001,
      barId: crypto.randomUUID() as string,
      ownerId: crypto.randomUUID() as string,
      eventIds: caso.jogos.map(() => crypto.randomUUID() as string)
    }))
    const caso = (rotulo: string) => {
      const found = fixtures.find((fixture) => fixture.rotulo === rotulo)
      if (!found) throw new Error(rotulo)
      return found
    }
    const ownerIds = fixtures.map((fixture) => fixture.ownerId)

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
        slug: `oferta-jogo-integration-${sportId}`
      })
      for (const fixture of fixtures) {
        await db.insert(bar).values({
          id: fixture.barId,
          userId: fixture.ownerId,
          name: `Bar ${fixture.rotulo}`,
          address: 'Rua descartável, 1',
          neighborhood: 'Teste',
          city: 'Teste',
          latitude: (lat + fixture.offset).toFixed(8),
          longitude: lng.toFixed(8),
          houseOffer: fixture.oferta,
          isActive: true
        })
        await db.insert(subscription).values({
          barId: fixture.barId,
          plan: fixture.plano,
          status: 'active'
        })
        for (const [index, jogo] of fixture.jogos.entries()) {
          await db.insert(event).values({
            id: fixture.eventIds[index],
            barId: fixture.barId,
            sportId,
            championship: `Jogo ${fixture.rotulo}`,
            startsAt: em(jogo.horas),
            houseOffer: jogo.houseOffer,
            noHouseOffer: jogo.noHouseOffer
          })
        }
      }

      const caller = appRouter.createCaller(contextFor(fanId, 'fan', now))
      // Coordenada própria por busca: a busca guarda a página em cache.
      let passo = 0
      const buscar = async (amenities?: number[], sort?: 'rating') => {
        passo += 1
        const page = await caller.pubs.search({
          lat,
          lng: lng + passo * 0.002,
          radiusKm: 3,
          amenities,
          sort,
          limit: 20
        })
        return Object.fromEntries(
          page.bars.map((b) => [
            b.id,
            { proximo: b.nextEvent?.id, jogos: b.event_count }
          ])
        )
      }

      const seguinte = caso('sem no próximo, com no seguinte')
      const esperado = {
        [caso('herda').barId]: {
          proximo: caso('herda').eventIds[0],
          jogos: 1
        },
        [caso('só no jogo').barId]: {
          proximo: caso('só no jogo').eventIds[0],
          jogos: 1
        },
        // O card mostra o jogo com oferta, e conta só os com oferta.
        [seguinte.barId]: { proximo: seguinte.eventIds[1], jogos: 1 }
      }
      expect(await buscar([10])).toEqual(esperado)
      expect(await buscar([10], 'rating')).toEqual(esperado)
      // Sem o filtro, nada muda: o próximo é o sem oferta, e conta os dois.
      expect((await buscar())[seguinte.barId]).toEqual({
        proximo: seguinte.eventIds[0],
        jogos: 2
      })

      // "Quando" conta só os jogos com oferta; o bar sem jogo usa a padrão.
      const dias = await caller.pubs.gameDays({
        lat,
        lng,
        radiusKm: 3,
        amenities: [10]
      })
      expect(dias.reduce((soma, dia) => soma + dia.games, 0)).toBe(3)
      const semJogo = await caller.pubs.nearbyWithoutGames({
        lat,
        lng,
        radiusKm: 3,
        amenities: [10]
      })
      expect(semJogo.map((b) => b.id)).toEqual([
        caso('sem jogo, com padrão').barId
      ])

      await setAppConfig('search.tiered_plan_query', false, null)
      expect(await buscar([10])).toEqual(esperado)
    } finally {
      await resetAppConfig('search.tiered_plan_query')
      await db.delete(user).where(inArray(user.id, [fanId, ...ownerIds]))
      await db.delete(sport).where(inArray(sport.id, [sportId]))
    }
  }
)
