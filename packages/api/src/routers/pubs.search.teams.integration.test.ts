import { expect, test } from 'bun:test'
import { inArray } from '@findsports_oficial/db'
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
import { contextFor, load } from './integration-seed'

/**
 * WEB-67: o termo digitado casa com time do jogo e `participant_free_text`,
 * sem acento separar resultado, e `teamIds` filtra por time — nos três
 * caminhos da busca. Contra o banco porque `search_normalize` (0039) só
 * existe lá.
 */
const integrationTest = isDisposableTestDatabase() ? test : test.skip

/** Longe de qualquer bar de seed ou de outro teste. */
const ORIGIN_LAT = -34.25
const ORIGIN_LNG = -40.75

integrationTest(
  'busca por time, texto livre e sem acento, nos três caminhos',
  async () => {
    const [{ db, appRouter }, { resetAppConfig, setAppConfig }] =
      await Promise.all([load(), import('../lib/app-config')])

    const fanId = crypto.randomUUID()
    const sportId = crypto.randomUUID()
    const now = new Date()
    const times = {
      Flamengo: crypto.randomUUID(),
      Grêmio: crypto.randomUUID(),
      Palmeiras: crypto.randomUUID()
    }

    const fixtures = [
      {
        rotulo: 'times',
        barName: 'Bar Alfa',
        championship: 'Copa Qualquer',
        teams: [times.Flamengo, times.Grêmio],
        freeText: null
      },
      {
        rotulo: 'livre',
        barName: 'Bar Beta',
        championship: 'Liga Ômega',
        teams: [] as string[],
        freeText: 'São Paulo x Santos'
      },
      {
        rotulo: 'campeonato',
        barName: 'Bar Cruzeiro do Sul',
        championship: 'Brasileirão Série Z',
        teams: [] as string[],
        freeText: null
      },
      {
        rotulo: 'palmeiras',
        barName: 'Bar Delta',
        championship: 'Amistoso',
        teams: [times.Palmeiras],
        freeText: null
      }
    ].map((fixture, index) => ({
      ...fixture,
      offset: 0.001 * (index + 1),
      barId: crypto.randomUUID(),
      ownerId: crypto.randomUUID(),
      eventId: crypto.randomUUID()
    }))

    const id = (rotulo: string) =>
      fixtures.find((fixture) => fixture.rotulo === rotulo)?.barId as string
    const ownerIds = fixtures.map((fixture) => fixture.ownerId)

    await db.insert(user).values(
      [
        { id: fanId, role: 'fan' as const },
        ...ownerIds.map((ownerId) => ({ id: ownerId, role: 'pub' as const }))
      ].map((row) => ({
        ...row,
        name: `Usuário ${row.id}`,
        email: `${row.id}@integration.invalid`,
        emailVerified: true,
        onboardingCompleted: true
      }))
    )

    try {
      await db.insert(sport).values({
        id: sportId,
        name: `Esporte ${sportId}`,
        slug: `teams-integration-${sportId}`
      })
      await db.insert(team).values(
        Object.entries(times).map(([name, teamId]) => ({
          id: teamId,
          sportId,
          name,
          slug: `team-${teamId}`
        }))
      )

      for (const fixture of fixtures) {
        await db.insert(bar).values({
          id: fixture.barId,
          userId: fixture.ownerId,
          name: fixture.barName,
          address: 'Rua descartável, 1',
          neighborhood: 'Teste',
          city: 'Teste',
          latitude: (ORIGIN_LAT + fixture.offset).toFixed(8),
          longitude: ORIGIN_LNG.toFixed(8),
          isActive: true
        })
        await db.insert(subscription).values({
          barId: fixture.barId,
          plan: 'starter',
          status: 'active'
        })
        await db.insert(event).values({
          id: fixture.eventId,
          barId: fixture.barId,
          sportId,
          championship: fixture.championship,
          participantFreeText: fixture.freeText,
          startsAt: new Date(now.getTime() + 60 * 60_000)
        })
        if (fixture.teams.length > 0) {
          await db.insert(eventParticipants).values(
            fixture.teams.map((teamId) => ({
              eventId: fixture.eventId,
              teamId
            }))
          )
        }
      }

      await setAppConfig('rating.public_display', true, null)

      const caller = appRouter.createCaller(contextFor(fanId, 'fan', now))

      // Coordenada nova a cada busca: o cache de 60 s usa a origem exata.
      let passo = 0
      const buscar = async (
        sort: 'relevance' | 'rating',
        filtro: { championship?: string; teamIds?: string[] }
      ) => {
        passo += 1
        const page = await caller.pubs.search({
          lat: ORIGIN_LAT,
          lng: ORIGIN_LNG + passo * 0.0001,
          radiusKm: 3,
          sort,
          ...filtro,
          limit: 20
        })
        return page.bars.map((encontrado) => encontrado.id).sort()
      }

      const caminhos = [
        { nome: 'camadas', sort: 'relevance', tiered: true },
        { nome: 'linear', sort: 'relevance', tiered: false },
        { nome: 'nota', sort: 'rating', tiered: true }
      ] as const

      for (const caminho of caminhos) {
        await setAppConfig('search.tiered_plan_query', caminho.tiered, null)
        const casos: [
          { championship?: string; teamIds?: string[] },
          string[]
        ][] = [
          // Repro do ticket: só o time casa.
          [{ championship: 'Flamengo' }, [id('times')]],
          [{ championship: 'gremio' }, [id('times')]],
          [{ championship: 'GRÊMIO' }, [id('times')]],
          [{ championship: 'sao paulo' }, [id('livre')]],
          [{ championship: 'São Paulo' }, [id('livre')]],
          // Campeonato e nome do bar continuam casando.
          [{ championship: 'brasileirao serie' }, [id('campeonato')]],
          [{ championship: 'cruzeiro' }, [id('campeonato')]],
          [{ teamIds: [times.Palmeiras] }, [id('palmeiras')]],
          [
            { teamIds: [times.Palmeiras, times.Flamengo] },
            [id('palmeiras'), id('times')].sort()
          ],
          [{ championship: 'gremio', teamIds: [times.Palmeiras] }, []]
        ]

        for (const [filtro, esperado] of casos) {
          expect({
            caminho: caminho.nome,
            filtro,
            bares: await buscar(caminho.sort, filtro)
          }).toEqual({ caminho: caminho.nome, filtro, bares: esperado })
        }
      }
    } finally {
      await resetAppConfig('search.tiered_plan_query')
      await resetAppConfig('rating.public_display')
      await db.delete(user).where(inArray(user.id, [fanId, ...ownerIds]))
      await db.delete(sport).where(inArray(sport.id, [sportId]))
    }
  }
)
