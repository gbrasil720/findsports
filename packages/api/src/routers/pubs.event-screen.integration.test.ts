import { expect, test } from 'bun:test'
import { eq } from '@findsports_oficial/db'
import { event, sport } from '@findsports_oficial/db/schema/platform'
import { isDisposableTestDatabase } from '@findsports_oficial/db/utils/db-resolver'
import {
  executarBuscaEmCamadas,
  executarBuscaLinear,
  executarBuscaPorNota
} from '../lib/pub-search'
import { seedBar } from './integration-seed'

/**
 * Telão e som por jogo (WEB-399): o jogo sem valor herda as características
 * do bar (1 telão, 2 som), o que o dono marcou no "Novo evento" vale sobre
 * elas, e a página do bar e os três caminhos da busca dizem o mesmo.
 */
const integrationTest = isDisposableTestDatabase() ? test : test.skip

const LAT = -35.15
const LNG = -40.85
const soon = (hours: number) => new Date(Date.now() + hours * 3_600_000)

integrationTest(
  'jogo herda telão e som do bar, e o marcado no jogo vale sobre eles',
  async () => {
    const withScreen = await seedBar('starter', 'active', null, {
      latitude: LAT.toFixed(8),
      longitude: LNG.toFixed(8),
      amenities: [1]
    })
    const bare = await seedBar('starter', 'active', null, {
      latitude: (LAT + 0.002).toFixed(8),
      longitude: LNG.toFixed(8),
      amenities: []
    })
    try {
      const inherits = await withScreen.seedGame({ startsAt: soon(2) })
      const overridden = await withScreen.seedGame({
        startsAt: soon(5),
        onBigScreen: false,
        withSound: true
      })
      await bare.seedGame({ startsAt: soon(3), withSound: true })

      const profile = await withScreen.fan.pubs.getById({
        id: withScreen.barId
      })
      const game = (id: string) => {
        const found = profile.events.find((item) => item.id === id)
        return { onBigScreen: found?.onBigScreen, withSound: found?.withSound }
      }
      expect(game(inherits)).toEqual({ onBigScreen: true, withSound: false })
      expect(game(overridden)).toEqual({ onBigScreen: false, withSound: true })

      const input = { lat: LAT, lng: LNG, radiusKm: 1, limit: 20 }
      const page = await withScreen.fan.pubs.search(input)
      const paths = await Promise.all([
        executarBuscaEmCamadas(input),
        executarBuscaLinear(input),
        executarBuscaPorNota({ ...input, sort: 'rating' })
      ])
      for (const result of [page, ...paths]) {
        const next = (barId: string) => {
          const found = result.bars.find((item) => item.id === barId)
          return {
            onBigScreen: found?.nextEvent?.onBigScreen,
            withSound: found?.nextEvent?.withSound
          }
        }
        expect(next(withScreen.barId)).toEqual({
          onBigScreen: true,
          withSound: false
        })
        expect(next(bare.barId)).toEqual({
          onBigScreen: false,
          withSound: true
        })
      }
    } finally {
      await withScreen.cleanup()
      await bare.cleanup()
    }
  }
)

integrationTest(
  'o "Novo evento" grava o que o dono marcou; sem marcar, fica herdando',
  async () => {
    const seeded = await seedBar('starter', 'active', null, { amenities: [1] })
    const sportId = crypto.randomUUID()
    const { db } = seeded
    await db
      .insert(sport)
      .values({ id: sportId, name: 'Esporte', slug: `screen-${sportId}` })
    try {
      const base = { sportId, startsAt: soon(24).toISOString() }
      await seeded.owner.pub.createEvent({
        ...base,
        championship: 'Sem marcar'
      })
      await seeded.owner.pub.createEvent({
        ...base,
        championship: 'Sem telão',
        onBigScreen: false,
        withSound: true
      })
      const stored = await db
        .select({
          id: event.id,
          championship: event.championship,
          onBigScreen: event.onBigScreen,
          withSound: event.withSound
        })
        .from(event)
        .where(eq(event.barId, seeded.barId))
      const by = (name: string) =>
        stored.find((row) => row.championship === name)
      expect(by('Sem marcar')).toMatchObject({
        onBigScreen: null,
        withSound: null
      })
      expect(by('Sem telão')).toMatchObject({
        onBigScreen: false,
        withSound: true
      })

      const edited = by('Sem telão')
      if (!edited) throw new Error('jogo não criado')
      await seeded.owner.pub.updateEvent({
        eventId: edited.id,
        onBigScreen: true
      })
      const [after] = await db
        .select({ onBigScreen: event.onBigScreen, withSound: event.withSound })
        .from(event)
        .where(eq(event.id, edited.id))
      expect(after).toEqual({ onBigScreen: true, withSound: true })
    } finally {
      await seeded.cleanup()
      await db.delete(sport).where(eq(sport.id, sportId))
    }
  }
)
