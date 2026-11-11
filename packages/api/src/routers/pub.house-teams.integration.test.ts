import { expect, test } from 'bun:test'
import { eq, inArray } from '@findsports_oficial/db'
import { sport, team } from '@findsports_oficial/db/schema/platform'
import { isDisposableTestDatabase } from '@findsports_oficial/db/utils/db-resolver'
import { refusal, seedBar } from './integration-seed'

// "Times da casa" (WEB-433): gravar, ler e o teto.

const integrationTest = isDisposableTestDatabase() ? test : test.skip

integrationTest(
  'troca os times da casa, ignora id fora do catálogo e recusa mais de cinco',
  async () => {
    const meu = await seedBar('pro', 'active', null)
    const sportId = crypto.randomUUID()
    const ids = Array.from({ length: 6 }, () => crypto.randomUUID())
    try {
      await meu.db.insert(sport).values({
        id: sportId,
        name: `Esporte ${sportId}`,
        slug: `integration-${sportId}`
      })
      await meu.db.insert(team).values(
        ids.map((id, i) => ({
          id,
          sportId,
          name: `Time ${i}`,
          slug: `integration-${id}`
        }))
      )
      await meu.owner.pub.updateHouseTeams({
        teamIds: [ids[0] as string, crypto.randomUUID()]
      })
      expect(await meu.owner.pub.getMyHouseTeams()).toEqual([
        { id: ids[0] as string, name: 'Time 0', sportId }
      ])

      await meu.owner.pub.updateHouseTeams({ teamIds: [] })
      expect(await meu.owner.pub.getMyHouseTeams()).toEqual([])

      expect(
        (await refusal(meu.owner.pub.updateHouseTeams({ teamIds: ids }))).code
      ).toBe('BAD_REQUEST')
    } finally {
      await meu.cleanup()
      await meu.db.delete(team).where(inArray(team.id, ids))
      await meu.db.delete(sport).where(eq(sport.id, sportId))
    }
  }
)
