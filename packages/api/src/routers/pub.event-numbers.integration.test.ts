import { expect, test } from 'bun:test'
import { brasiliaDay } from '@findsports_oficial/db/event-window'
import { barCommercialEvent } from '@findsports_oficial/db/schema/analytics'
import { isDisposableTestDatabase } from '@findsports_oficial/db/utils/db-resolver'
import { seedBar } from './integration-seed'

// A faixa de números do jogo publicado (WEB-433): interesse, abertura do bar
// e os outros bares do bairro com o mesmo jogo.

const integrationTest = isDisposableTestDatabase() ? test : test.skip

const inHours = (hours: number) => new Date(Date.now() + hours * 3_600_000)

integrationTest(
  'conta quem se interessou e abriu o bar pelo jogo e os outros bares do bairro com ele',
  async () => {
    const place = {
      city: `Cidade ${crypto.randomUUID().slice(0, 8)}`,
      neighborhood: 'Consolação'
    }
    const meu = await seedBar('pro', 'active', inHours(500), place)
    const vizinho = await seedBar('pro', 'active', inHours(500), place)
    const longe = await seedBar('pro', 'active', inHours(500), {
      ...place,
      neighborhood: 'Pinheiros'
    })
    try {
      const startsAt = inHours(27)
      const jogo = {
        championship: 'Liga de integração',
        participantFreeText: 'Clássico do bairro',
        startsAt
      }
      const eventId = await meu.seedGame(jogo)
      await vizinho.seedGame(jogo)
      await longe.seedGame(jogo)
      const outro = await meu.seedGame({ ...jogo, startsAt: inHours(50) })

      const action = (
        type: (typeof barCommercialEvent.$inferInsert)['type'],
        hoursAgo: number,
        actorUserId = meu.fanId
      ) => {
        const occurredAt = inHours(-hoursAgo)
        return {
          barId: meu.barId,
          actorUserId,
          type,
          sourceEventId: eventId,
          occurredAt,
          commercialDay: brasiliaDay(occurredAt)
        }
      }
      await meu.db
        .insert(barCommercialEvent)
        .values([
          action('profile_view', 30),
          action('whatsapp_opened', 30),
          action('directions_opened', 2, meu.ownerId),
          action('profile_view', 2, vizinho.fanId)
        ])

      const numbers = await meu.owner.pub.getMyEventNumbers()
      expect(numbers.find((n) => n.eventId === eventId)).toEqual({
        eventId,
        interested: 2,
        interestedLastDay: 1,
        views: 2,
        barsInNeighborhood: 1,
        vsAverage: null
      })
      expect(numbers.find((n) => n.eventId === outro)).toMatchObject({
        interested: 0,
        barsInNeighborhood: 0
      })
    } finally {
      for (const t of [meu, vizinho, longe]) await t.cleanup()
    }
  }
)
