import { expect, test } from 'bun:test'
import { isDisposableTestDatabase } from '@findsports_oficial/db/utils/db-resolver'
import { seedBar } from './integration-seed'

/**
 * O dia da busca é o de Brasília (o app e a IA mandam `YYYY-MM-DD` daqui), e
 * `starts_at` guarda UTC: jogo às 23:00 do dia D é 02:00 UTC de D+1. Comparar
 * pelo dia UTC o jogava para o dia seguinte.
 */
const integrationTest = isDisposableTestDatabase() ? test : test.skip

const ORIGIN = { lat: -31.7, lng: -44.2 }

integrationTest(
  'jogo às 23:00 de Brasília aparece no dia D e não em D+1, nos três caminhos',
  async () => {
    const { resetAppConfig, setAppConfig } = await import('../lib/app-config')
    const seeded = await seedBar('pro', 'active', null, {
      latitude: String(ORIGIN.lat),
      longitude: String(ORIGIN.lng)
    })
    const today = new Date().toLocaleDateString('en-CA', {
      timeZone: 'America/Sao_Paulo'
    })
    const day = (offset: number) => {
      const d = new Date(`${today}T12:00:00Z`)
      d.setUTCDate(d.getUTCDate() + offset)
      return d.toISOString().slice(0, 10)
    }
    const dayD = day(3)
    await seeded.seedGame({ startsAt: new Date(`${dayD}T23:00:00-03:00`) })

    try {
      const found = async (date: string, sort: 'relevance' | 'rating') =>
        (
          await seeded.fan.pubs.search({ ...ORIGIN, radiusKm: 3, date, sort })
        ).bars.map((b) => b.id)

      expect(await found(dayD, 'relevance')).toEqual([seeded.barId])
      expect(await found(day(4), 'relevance')).toEqual([])
      expect(await found(dayD, 'rating')).toEqual([seeded.barId])
      expect(await found(day(4), 'rating')).toEqual([])

      await setAppConfig('search.tiered_plan_query', false, null)
      expect(await found(dayD, 'relevance')).toEqual([seeded.barId])
      expect(await found(day(4), 'relevance')).toEqual([])
    } finally {
      await resetAppConfig('search.tiered_plan_query')
      await seeded.cleanup()
    }
  }
)
