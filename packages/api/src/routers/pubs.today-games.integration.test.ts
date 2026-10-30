import { expect, test } from 'bun:test'
import { inArray } from '@findsports_oficial/db'
import { user } from '@findsports_oficial/db/schema/auth'
import {
  bar,
  event,
  eventParticipants,
  sport,
  team
} from '@findsports_oficial/db/schema/platform'
import { isDisposableTestDatabase } from '@findsports_oficial/db/utils/db-resolver'
import { load } from './integration-seed'

/**
 * A agenda do dia que a splash do app mostra (`pubs.todayGames`): aberta, só
 * de bar no ar, só de hoje, e o mesmo jogo em dois bares conta uma vez, com
 * os dois bares na contagem.
 */
const integrationTest = isDisposableTestDatabase() ? test : test.skip

const HOUR = 3_600_000

integrationTest(
  'devolve os jogos de hoje dos bares no ar, uma vez cada, sem sessão',
  async () => {
    const { db, appRouter } = await load()

    // O banco é compartilhado: tudo daqui leva a marca, e só ela é conferida.
    const mark = crypto.randomUUID().slice(0, 8)
    const sportId = crypto.randomUUID()
    const [home, away] = [crypto.randomUUID(), crypto.randomUUID()]
    const now = new Date()
    const owners = ['aberto', 'outro', 'fora'].map((key) => ({
      key,
      userId: crypto.randomUUID(),
      barId: crypto.randomUUID()
    }))
    const byKey = (key: string) => owners.find((o) => o.key === key)?.barId

    await db.insert(user).values(
      owners.map((owner) => ({
        id: owner.userId,
        name: `Dono ${owner.key}`,
        email: `${owner.userId}@integration.invalid`,
        emailVerified: true,
        role: 'pub' as const,
        onboardingCompleted: true
      }))
    )

    try {
      await db.insert(sport).values({
        id: sportId,
        name: `Esporte ${mark}`,
        slug: `today-games-${sportId}`
      })
      await db.insert(team).values([
        { id: home, sportId, name: `Mandante ${mark}`, slug: `home-${home}` },
        { id: away, sportId, name: `Visitante ${mark}`, slug: `away-${away}` }
      ])
      await db.insert(bar).values(
        owners.map((owner, index) => ({
          id: owner.barId,
          userId: owner.userId,
          name: `Bar ${owner.key} ${mark}`,
          address: 'Rua descartável, 1',
          neighborhood: 'Teste',
          city: 'Teste',
          latitude: (-27.5 + index * 0.001).toFixed(8),
          longitude: (-47.25).toFixed(8),
          // O terceiro bar saiu do ar: o jogo dele não entra.
          isActive: owner.key !== 'fora'
        }))
      )

      const match = (barId: string | undefined, startsAt: Date) => ({
        id: crypto.randomUUID(),
        barId: barId as string,
        sportId,
        championship: `Campeonato ${mark}`,
        startsAt
      })
      // O mesmo jogo, na mesma hora, em dois bares no ar.
      const shared = [match(byKey('aberto'), now), match(byKey('outro'), now)]
      // Amanhã (26 h à frente é sempre outro dia), e o do bar fora do ar.
      const tomorrow = match(
        byKey('aberto'),
        new Date(now.getTime() + 26 * HOUR)
      )
      const offAir = {
        ...match(byKey('fora'), now),
        participantFreeText: `Fora do ar ${mark}`
      }
      // Sem times: vale o texto livre.
      const freeText = {
        ...match(byKey('aberto'), now),
        participantFreeText: `Treino livre ${mark}`
      }
      await db.insert(event).values([...shared, tomorrow, offAir, freeText])
      await db.insert(eventParticipants).values(
        [...shared, tomorrow].flatMap((game) => [
          { eventId: game.id, teamId: home, position: 0 },
          { eventId: game.id, teamId: away, position: 1 }
        ])
      )

      // Sem sessão: a splash roda antes do login.
      const caller = appRouter.createCaller({
        auth: null,
        session: null,
        clientIp: '127.0.0.1'
      })
      const games = (await caller.pubs.todayGames()).filter((game) =>
        game.title.includes(mark)
      )

      expect(games.map((game) => game.title).sort()).toEqual([
        `Mandante ${mark} × Visitante ${mark}`,
        `Treino livre ${mark}`
      ])
      for (const game of games) {
        expect(game.startsAt).toBe(now.toISOString())
      }
      // Quantos bares no ar passam cada jogo: o do bar fora do ar não conta.
      expect(
        Object.fromEntries(games.map((game) => [game.title, game.bars]))
      ).toEqual({
        [`Mandante ${mark} × Visitante ${mark}`]: 2,
        [`Treino livre ${mark}`]: 1
      })
    } finally {
      await db.delete(user).where(
        inArray(
          user.id,
          owners.map((owner) => owner.userId)
        )
      )
      await db.delete(team).where(inArray(team.id, [home, away]))
      await db.delete(sport).where(inArray(sport.id, [sportId]))
    }
  }
)
