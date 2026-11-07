import { expect, test } from 'bun:test'
import { brasiliaDay } from '@findsports_oficial/db/event-window'
import { isDisposableTestDatabase } from '@findsports_oficial/db/utils/db-resolver'
import { inAMonth, load, seedBar } from './integration-seed'

/**
 * "Sem jogo marcado" do Explorar do web (`pubs.barsWithoutGame`): aberta, só
 * bar no ar, sem jogo publicado no dia, do mais perto ao mais longe. Jogo em
 * outro dia ou em rascunho não tira o bar da lista.
 */
const integrationTest = isDisposableTestDatabase() ? test : test.skip

integrationTest(
  'lista os bares perto sem jogo no dia, sem sessão',
  async () => {
    const { appRouter } = await load()
    // Um ponto só deste teste, longe dos bares dos outros.
    const lat = -23.7
    const lng = -46.9
    const at = (km: number) => ({
      latitude: (lat + km / 111).toFixed(8),
      longitude: lng.toFixed(8)
    })
    const startsAt = new Date(Date.now() + 60 * 60_000)
    const day = brasiliaDay(startsAt)
    const comJogo = await seedBar('elite', 'active', inAMonth(), at(0.1))
    const longe = await seedBar('starter', 'active', inAMonth(), {
      ...at(0.6),
      openingHours: Array(7).fill({ opens: '00:00', closes: '23:59' })
    })
    const perto = await seedBar('starter', 'active', inAMonth(), at(0.3))
    const amanha = await seedBar('starter', 'active', inAMonth(), at(0.4))
    const rascunho = await seedBar('starter', 'active', inAMonth(), at(0.5))
    const fora = await seedBar('starter', 'active', inAMonth(), {
      ...at(0.2),
      isActive: false
    })
    const bares = [comJogo, longe, perto, amanha, rascunho, fora]
    try {
      await comJogo.seedGame({ startsAt, publishedAt: new Date() })
      await amanha.seedGame({
        startsAt: new Date(startsAt.getTime() + 26 * 3_600_000),
        publishedAt: new Date()
      })
      await rascunho.seedGame({ startsAt, publishedAt: null })

      const caller = appRouter.createCaller({
        auth: null,
        session: null,
        clientIp: '127.0.0.1'
      })
      const lista = await caller.pubs.barsWithoutGame({
        lat,
        lng,
        radiusKm: 1,
        day
      })

      expect(lista.map((b) => b.barId)).toEqual([
        perto.barId,
        amanha.barId,
        rascunho.barId,
        longe.barId
      ])
      expect(lista[0]?.opening).toBeNull()
      expect(lista[3]?.opening?.open).toBe(true)
    } finally {
      for (const b of bares) await b.cleanup()
    }
  }
)
