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
 * mesmo bar "Corinthians × Palmeiras": `event_participants` não guardava
 * ordem e cada plano devolvia a sua. Hoje a ordem é a que o bar informou
 * (`position`, mandante primeiro); jogo anterior à coluna sai por nome do
 * time. Todas as leituras decidem em `game-participants`.
 */
const integrationTest = isDisposableTestDatabase() ? test : test.skip

/** Longe de qualquer bar de seed ou de outro teste. */
const ORIGIN_LAT = -30.25
const ORIGIN_LNG = -44.25

integrationTest(
  'busca, perfil e grade mostram os times na ordem que o bar informou',
  async () => {
    const [{ db, appRouter }, { resetAppConfig, setAppConfig }] =
      await Promise.all([load(), import('../lib/app-config')])

    const fanId = crypto.randomUUID()
    const ownerId = crypto.randomUUID()
    const sportId = crypto.randomUUID()
    const barId = crypto.randomUUID()
    const now = new Date()
    // Fora da ordem alfabética: o Palmeiras joga em casa.
    const palmeiras = { id: crypto.randomUUID(), name: 'Palmeiras' }
    const corinthians = { id: crypto.randomUUID(), name: 'Corinthians' }

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
        [palmeiras, corinthians].map((time) => ({
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

      const fan = appRouter.createCaller(contextFor(fanId, 'fan', now))
      const owner = appRouter.createCaller(contextFor(ownerId, 'pub', now))

      const caminhos = [
        { nome: 'camadas', sort: 'relevance', tiered: true },
        { nome: 'linear', sort: 'relevance', tiered: false },
        { nome: 'nota', sort: 'rating', tiered: true }
      ] as const

      // Coordenada nova a cada busca: o cache de 60 s usa a origem exata.
      let passo = 0
      const leituras = async () => {
        const perfil = await fan.pubs.getById({ id: barId })
        const grade = await owner.pub.getMyEvents()
        const lidas: Record<string, string[] | undefined> = {
          perfil: perfil.events[0]?.participants.map(({ team }) => team.name),
          grade: grade[0]?.participants.map(({ team }) => team.name)
        }
        for (const caminho of caminhos) {
          await setAppConfig('search.tiered_plan_query', caminho.tiered, null)
          passo += 1
          const page = await fan.pubs.search({
            lat: ORIGIN_LAT,
            lng: ORIGIN_LNG + passo * 0.0001,
            radiusKm: 3,
            sort: caminho.sort,
            limit: 20
          })
          const card = page.bars.find((encontrado) => encontrado.id === barId)
          lidas[caminho.nome] = card?.nextEvent?.participants.map(
            ({ team }) => team.name
          )
        }
        return lidas
      }
      const emTodas = (times: string[]) => ({
        perfil: times,
        grade: times,
        camadas: times,
        linear: times,
        nota: times
      })

      await owner.pub.createEvent({
        sportId,
        championship: 'Brasileirão',
        startsAt: new Date(now.getTime() + 60 * 60_000).toISOString(),
        participantIds: [palmeiras.id, corinthians.id]
      })
      expect(await leituras()).toEqual(emTodas(['Palmeiras', 'Corinthians']))

      const [jogo] = await db
        .select({ id: event.id })
        .from(event)
        .where(eq(event.barId, barId))
      if (!jogo) throw new Error('jogo não foi criado')

      // Jogo anterior à coluna: sem `position`, sai por nome do time.
      await db
        .update(eventParticipants)
        .set({ position: null })
        .where(eq(eventParticipants.eventId, jogo.id))
      expect(await leituras()).toEqual(emTodas(['Corinthians', 'Palmeiras']))

      // Editar grava a ordem enviada, também no jogo antigo. O formulário
      // manda os demais campos junto.
      const editar = (participantIds: string[]) =>
        owner.pub.updateEvent({
          eventId: jogo.id,
          championship: 'Brasileirão',
          participantIds
        })
      await editar([palmeiras.id, corinthians.id])
      expect(await leituras()).toEqual(emTodas(['Palmeiras', 'Corinthians']))

      // Inverter no formulário é mandar o array invertido.
      await editar([corinthians.id, palmeiras.id])
      expect(await leituras()).toEqual(emTodas(['Corinthians', 'Palmeiras']))

      // Editar outro campo não mexe nos times.
      await editar([palmeiras.id, corinthians.id])
      await owner.pub.updateEvent({ eventId: jogo.id, championship: 'Copa' })
      expect(await leituras()).toEqual(emTodas(['Palmeiras', 'Corinthians']))

      // Só os times, sem nenhum outro campo: a API aceita e não pode estourar.
      await owner.pub.updateEvent({
        eventId: jogo.id,
        participantIds: [corinthians.id, palmeiras.id]
      })
      expect(await leituras()).toEqual(emTodas(['Corinthians', 'Palmeiras']))
    } finally {
      await resetAppConfig('search.tiered_plan_query')
      await db.delete(user).where(inArray(user.id, [fanId, ownerId]))
      await db.delete(sport).where(eq(sport.id, sportId))
    }
  }
)
