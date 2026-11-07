import { expect, test } from 'bun:test'
import { gameReminder } from '@findsports_oficial/db/schema/recommendation'
import { isDisposableTestDatabase } from '@findsports_oficial/db/utils/db-resolver'
import { seedBar } from './integration-seed'

const integrationTest = isDisposableTestDatabase() ? test : test.skip

const HOUR = 3_600_000

// "Os jogos lembrados que ainda não acabaram" é o fim derivado da ADR 0003.
// Antes, a consulta cortava em `starts_at >= agora - 3 h`: ignorava o
// `ends_at` informado e, com o `Date` cru no SQL, andava com o fuso do
// processo (3 h a mais num Mac em Brasília).
integrationTest('Lembrar mostra o jogo até o fim derivado', async () => {
  const seed = await seedBar('elite', 'active', null)
  const now = Date.now()
  try {
    const longGame = await seed.seedGame({
      startsAt: new Date(now - 4 * HOUR),
      endsAt: new Date(now + HOUR)
    })
    const endedGame = await seed.seedGame({
      startsAt: new Date(now - 4 * HOUR),
      endsAt: new Date(now - HOUR / 2)
    })
    const usualGame = await seed.seedGame({
      startsAt: new Date(now - 2 * HOUR)
    })
    await seed.db.insert(gameReminder).values(
      [longGame, endedGame, usualGame].map((eventId) => ({
        userId: seed.fanId,
        eventId
      }))
    )

    const { reminders } = await seed.fan.recommendations.notices()

    expect(new Set(reminders.map((r) => r.eventId))).toEqual(
      new Set([longGame, usualGame])
    )
  } finally {
    await seed.cleanup()
  }
})
