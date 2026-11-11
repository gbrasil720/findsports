import { expect, test } from 'bun:test'
import { inArray, sql } from '@findsports_oficial/db'
import { gameTitle } from '@findsports_oficial/db/game-title'
import { user } from '@findsports_oficial/db/schema/auth'
import {
  bar,
  event,
  eventParticipants,
  sport,
  team
} from '@findsports_oficial/db/schema/platform'
import { isDisposableTestDatabase } from '@findsports_oficial/db/utils/db-resolver'
import { load } from '../routers/integration-seed'
import { byMatchOrder, gameTitle as gameTitleSql } from './game-participants'

/**
 * O título do jogo existe em TypeScript (`@findsports_oficial/db/game-title`,
 * para as telas) e em SQL (`gameTitle` daqui, para as leituras cruas). As
 * duas têm de dar o mesmo título para o mesmo jogo.
 */
const integrationTest = isDisposableTestDatabase() ? test : test.skip

integrationTest('o título em SQL é o mesmo das telas', async () => {
  const { db } = await load()
  const mark = crypto.randomUUID().slice(0, 8)
  const userId = crypto.randomUUID()
  const barId = crypto.randomUUID()
  const sportId = crypto.randomUUID()
  const teams = ['Alfa', 'Beta', 'Gama'].map((name) => ({
    id: crypto.randomUUID(),
    sportId,
    name: `${name} ${mark}`,
    slug: `${name.toLowerCase()}-${crypto.randomUUID()}`
  }))
  const [a, b, c] = teams.map((t) => t.id) as [string, string, string]

  await db.insert(user).values({
    id: userId,
    name: 'Dono',
    email: `${userId}@integration.invalid`,
    emailVerified: true,
    role: 'pub',
    onboardingCompleted: true
  })
  try {
    await db.insert(sport).values({
      id: sportId,
      name: `Esporte ${mark}`,
      slug: `game-title-${sportId}`
    })
    await db.insert(team).values(teams)
    await db.insert(bar).values({
      id: barId,
      userId,
      name: `Bar ${mark}`,
      address: 'Rua descartável, 1',
      neighborhood: 'Teste',
      city: 'Teste',
      latitude: '-27.60000000',
      longitude: '-47.30000000'
    })

    const games = {
      // Mandante informado: Beta joga em casa.
      dois: [b, a],
      tresComLivre: [a, b, c],
      tresSemLivre: [a, b, c],
      um: [c],
      branco: '   ',
      livre: 'UFC 300',
      nada: null
    } as const
    const ids = Object.fromEntries(
      Object.keys(games).map((key) => [key, crypto.randomUUID()])
    ) as Record<keyof typeof games, string>
    await db.insert(event).values(
      Object.entries(games).map(([key, value]) => ({
        id: ids[key as keyof typeof games],
        barId,
        sportId,
        championship: `Campeonato ${mark}`,
        startsAt: new Date(),
        participantFreeText:
          typeof value === 'string'
            ? value
            : key === 'tresComLivre'
              ? 'GP de teste'
              : null
      }))
    )
    await db.insert(eventParticipants).values(
      Object.entries(games).flatMap(([key, value]) =>
        Array.isArray(value)
          ? value.map((teamId, position) => ({
              eventId: ids[key as keyof typeof games],
              teamId,
              position
            }))
          : []
      )
    )

    const fromSql = await db.execute<{ id: string; title: string }>(sql`
      SELECT e.id, ${gameTitleSql({
        id: sql`e.id`,
        participantFreeText: sql`e.participant_free_text`,
        championship: sql`e.championship`
      })} AS title
      FROM event e
      WHERE e.bar_id = ${barId}
    `)
    const fromTs = await db.query.event.findMany({
      where: inArray(event.id, Object.values(ids)),
      with: { participants: { with: { team: true }, orderBy: byMatchOrder } }
    })
    const sqlTitles = new Map(fromSql.rows.map((row) => [row.id, row.title]))
    const tsTitles = new Map(fromTs.map((game) => [game.id, gameTitle(game)]))

    expect(tsTitles.get(ids.dois)).toBe(`Beta ${mark} × Alfa ${mark}`)
    // Três ou mais não é confronto: texto livre, senão o campeonato.
    expect(tsTitles.get(ids.tresComLivre)).toBe('GP de teste')
    expect(tsTitles.get(ids.tresSemLivre)).toBe(`Campeonato ${mark}`)
    expect(tsTitles.get(ids.um)).toBe(`Campeonato ${mark}`)
    expect(tsTitles.get(ids.branco)).toBe(`Campeonato ${mark}`)
    expect(tsTitles.get(ids.livre)).toBe('UFC 300')
    expect(tsTitles.get(ids.nada)).toBe(`Campeonato ${mark}`)
    expect(Object.fromEntries(sqlTitles)).toEqual(Object.fromEntries(tsTitles))
  } finally {
    await db.delete(user).where(inArray(user.id, [userId]))
    await db.delete(team).where(
      inArray(
        team.id,
        teams.map((t) => t.id)
      )
    )
    await db.delete(sport).where(inArray(sport.id, [sportId]))
  }
})
