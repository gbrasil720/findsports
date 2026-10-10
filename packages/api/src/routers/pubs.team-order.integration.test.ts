import { expect, test } from 'bun:test'
import { eq, inArray } from '@findsports_oficial/db'
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
 * WEB-345: o card da busca dizia "Palmeiras × Corinthians" e o perfil do
 * mesmo bar "Corinthians × Palmeiras". `event_participants` não guarda ordem,
 * e as duas leituras não pediam nenhuma: cada plano devolvia a sua. As duas
 * passam a ordenar pelo nome do time, como as demais (`game-participants`).
 */
const integrationTest = isDisposableTestDatabase() ? test : test.skip

/** Longe de qualquer bar de seed ou de outro teste. */
const ORIGIN_LAT = -30.25
const ORIGIN_LNG = -44.25

integrationTest(
  'card da busca e perfil mostram os times do jogo na mesma ordem',
  async () => {
    const [{ db, appRouter }, { resetAppConfig, setAppConfig }] =
      await Promise.all([load(), import('../lib/app-config')])

    const fanId = crypto.randomUUID()
    const ownerId = crypto.randomUUID()
    const sportId = crypto.randomUUID()
    const barId = crypto.randomUUID()
    const eventId = crypto.randomUUID()
    const now = new Date()
    // Gravados fora da ordem alfabética, como o bar marcou no formulário.
    const times = [
      { id: crypto.randomUUID(), name: 'Palmeiras' },
      { id: crypto.randomUUID(), name: 'Corinthians' }
    ]

    await db.insert(user).values(
      [
        { id: fanId, role: 'fan' as const },
        { id: ownerId, role: 'pub' as const }
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
        slug: `team-order-integration-${sportId}`
      })
      await db.insert(team).values(
        times.map((time) => ({
          ...time,
          sportId,
          slug: `team-${time.id}`
        }))
      )
      await db.insert(bar).values({
        id: barId,
        userId: ownerId,
        name: 'Bar da ordem dos times',
        address: 'Rua descartável, 1',
        neighborhood: 'Teste',
        city: 'Teste',
        latitude: ORIGIN_LAT.toFixed(8),
        longitude: ORIGIN_LNG.toFixed(8),
        isActive: true
      })
      await db
        .insert(subscription)
        .values({ barId, plan: 'starter', status: 'active' })
      await db.insert(event).values({
        id: eventId,
        barId,
        sportId,
        championship: 'Brasileirão',
        startsAt: new Date(now.getTime() + 60 * 60_000)
      })
      for (const time of times) {
        await db.insert(eventParticipants).values({ eventId, teamId: time.id })
      }

      const caller = appRouter.createCaller(contextFor(fanId, 'fan', now))
      const esperado = ['Corinthians', 'Palmeiras']

      const perfil = await caller.pubs.getById({ id: barId })
      expect(
        perfil.events[0]?.participants.map(({ team }) => team.name)
      ).toEqual(esperado)

      const caminhos = [
        { nome: 'camadas', sort: 'relevance', tiered: true },
        { nome: 'linear', sort: 'relevance', tiered: false },
        { nome: 'nota', sort: 'rating', tiered: true }
      ] as const

      // Coordenada nova a cada busca: o cache de 60 s usa a origem exata.
      let passo = 0
      for (const caminho of caminhos) {
        await setAppConfig('search.tiered_plan_query', caminho.tiered, null)
        passo += 1
        const page = await caller.pubs.search({
          lat: ORIGIN_LAT,
          lng: ORIGIN_LNG + passo * 0.0001,
          radiusKm: 3,
          sort: caminho.sort,
          limit: 20
        })
        const card = page.bars.find((encontrado) => encontrado.id === barId)
        expect({
          caminho: caminho.nome,
          times: card?.nextEvent?.participants.map(({ team }) => team.name)
        }).toEqual({ caminho: caminho.nome, times: esperado })
      }
    } finally {
      await resetAppConfig('search.tiered_plan_query')
      await db.delete(user).where(inArray(user.id, [fanId, ownerId]))
      await db.delete(sport).where(eq(sport.id, sportId))
    }
  }
)
