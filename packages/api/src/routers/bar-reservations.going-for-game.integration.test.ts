import { expect, test } from 'bun:test'
import { attendance } from '@findsports_oficial/db/schema/attendance'
import { isDisposableTestDatabase } from '@findsports_oficial/db/utils/db-resolver'
import { seedBar } from './integration-seed'

// Quem vai de um jogo encerrado (o jogo aberto em Passados): `going` só traz
// jogo com a validação aberta, `goingForGame` lê um jogo sem a janela.

const integrationTest = isDisposableTestDatabase() ? test : test.skip

const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 3_600_000)

integrationTest(
  'jogo encerrado: o Elite vê quem marcou; outro plano e outro bar, nulo',
  async () => {
    const elite = await seedBar('elite', 'active', daysAgo(-30))
    const pro = await seedBar('pro', 'active', daysAgo(-30))
    try {
      const encerrado = await elite.seedGame({ startsAt: daysAgo(3) })
      await elite.db
        .insert(attendance)
        .values({ userId: elite.fanId, eventId: encerrado })

      // A lista de sempre já não o traz: a validação fechou.
      expect(
        (await elite.owner.barReservations.going()).map((g) => g.id)
      ).not.toContain(encerrado)

      const game = await elite.owner.barReservations.goingForGame({
        eventId: encerrado
      })
      expect(game?.id).toBe(encerrado)
      expect(game?.people.map((p) => p.name)).toEqual([
        'Torcedor de integração'
      ])

      // Fora do Elite, nulo; e o Elite não lê jogo de outro bar.
      expect(
        await pro.owner.barReservations.goingForGame({ eventId: encerrado })
      ).toBeNull()
      const doPro = await pro.seedGame({ startsAt: daysAgo(3) })
      await pro.db
        .insert(attendance)
        .values({ userId: pro.fanId, eventId: doPro })
      expect(
        await pro.owner.barReservations.goingForGame({ eventId: doPro })
      ).toBeNull()
      expect(
        await elite.owner.barReservations.goingForGame({ eventId: doPro })
      ).toBeNull()
    } finally {
      await elite.cleanup()
      await pro.cleanup()
    }
  }
)
