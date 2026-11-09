import { expect, test } from 'bun:test'
import { eq } from '@findsports_oficial/db'
import { sport } from '@findsports_oficial/db/schema/platform'
import { isDisposableTestDatabase } from '@findsports_oficial/db/utils/db-resolver'
import { seedBar } from './integration-seed'

// "Jogos que outros bares perto já marcaram": a fonte de sugestões de hoje.

const integrationTest = isDisposableTestDatabase() ? test : test.skip

const inDays = (days: number) => new Date(Date.now() + days * 24 * 3_600_000)

integrationTest(
  'sugere o jogo publicado por outro bar no ar da mesma cidade nos próximos 7 dias, uma vez, e nada do resto',
  async () => {
    const city = `Cidade ${crypto.randomUUID().slice(0, 8)}`
    const meu = await seedBar('starter', 'active', inDays(20), { city })
    const outro = await seedBar('elite', 'active', inDays(20), {
      city: city.toUpperCase()
    })
    const terceiro = await seedBar('pro', 'active', inDays(20), { city })
    const fora = await seedBar('pro', 'active', inDays(20), {
      city,
      isActive: false
    })
    const longe = await seedBar('pro', 'active', inDays(20), {
      city: `${city} do Norte`
    })
    const sportId = crypto.randomUUID()
    try {
      await meu.db.insert(sport).values({
        id: sportId,
        name: `Esporte ${sportId}`,
        slug: `integration-${sportId}`
      })
      const jogo = (title: string, startsAt: Date, extra = {}) => ({
        sportId,
        championship: 'Liga de integração',
        participantFreeText: title,
        startsAt,
        ...extra
      })
      const amanha = inDays(1)
      await outro.seedGame(jogo('Clássico da cidade', amanha))
      await terceiro.seedGame(jogo('Clássico da cidade', amanha))
      await outro.seedGame(jogo('Rascunho', inDays(2), { publishedAt: null }))
      await outro.seedGame(jogo('Já foi', inDays(-1)))
      await outro.seedGame(jogo('Daqui a oito dias', inDays(8)))
      const depois = inDays(3)
      await outro.seedGame(jogo('Que eu já tenho', depois))
      await meu.seedGame(jogo('Que eu já tenho', depois))
      await fora.seedGame(jogo('Bar fora do ar', inDays(2)))
      await longe.seedGame(jogo('Outra cidade', inDays(2)))

      expect(await meu.owner.pub.gameSuggestions()).toEqual([
        {
          key: `${amanha.toISOString()}|Clássico da cidade`,
          title: 'Clássico da cidade',
          sportId,
          championship: 'Liga de integração',
          startsAt: amanha.toISOString(),
          participantIds: [],
          participantFreeText: 'Clássico da cidade'
        }
      ])
    } finally {
      for (const t of [meu, outro, terceiro, fora, longe]) await t.cleanup()
      await meu.db.delete(sport).where(eq(sport.id, sportId))
    }
  }
)
