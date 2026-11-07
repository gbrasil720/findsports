import { expect, test } from 'bun:test'
import { brasiliaDay } from '@findsports_oficial/db/event-window'
import { isDisposableTestDatabase } from '@findsports_oficial/db/utils/db-resolver'
import { inAMonth, load, seedBar } from './integration-seed'

/**
 * A régua do Explorar do web (`pubs.gameBoard`, WEB-501): aberta, o mesmo
 * jogo em dois bares é um jogo com dois bares, a oferta só sai do Elite e bar
 * fora do ar não entra.
 */
const integrationTest = isDisposableTestDatabase() ? test : test.skip

integrationTest(
  'agrupa o jogo do dia pelos bares que o passam, sem sessão',
  async () => {
    const { appRouter } = await load()
    const mark = crypto.randomUUID().slice(0, 8)
    const startsAt = new Date(Date.now() + 60 * 60_000)
    const elite = await seedBar('elite', 'active', inAMonth(), {
      houseOffer: `Chopp ${mark}`
    })
    const starter = await seedBar('starter', 'active', inAMonth(), {
      houseOffer: `Não sai ${mark}`
    })
    const fora = await seedBar('elite', 'active', inAMonth(), {
      isActive: false
    })
    try {
      const jogo = { startsAt, participantFreeText: `Final ${mark}` }
      await elite.seedGame(jogo)
      await starter.seedGame(jogo)
      await fora.seedGame(jogo)
      await elite.seedGame({
        startsAt: new Date(startsAt.getTime() + 26 * 3_600_000),
        participantFreeText: `Amanhã ${mark}`
      })

      const caller = appRouter.createCaller({
        auth: null,
        session: null,
        clientIp: '127.0.0.1'
      })
      const board = await caller.pubs.gameBoard({
        lat: -23.55052,
        lng: -46.633308,
        radiusKm: 1,
        day: brasiliaDay(startsAt)
      })
      const meus = board.games.filter((game) => game.title.includes(mark))

      expect(meus.map((game) => game.title)).toEqual([`Final ${mark}`])
      const bares = meus[0]?.bars ?? []
      expect(bares.map((b) => b.barId).sort()).toEqual(
        [elite.barId, starter.barId].sort()
      )
      expect(bares.find((b) => b.barId === elite.barId)?.offer).toBe(
        `Chopp ${mark}`
      )
      expect(bares.find((b) => b.barId === starter.barId)?.offer).toBeNull()
      expect(bares.every((b) => b.going === null)).toBe(true)
    } finally {
      await elite.cleanup()
      await starter.cleanup()
      await fora.cleanup()
    }
  }
)
