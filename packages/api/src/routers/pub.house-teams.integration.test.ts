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

integrationTest(
  'a busca dos times da casa traz só clubes; sem o filtro, a do torcedor segue igual',
  async () => {
    const meu = await seedBar('pro', 'active', null)
    const sportId = crypto.randomUUID()
    const tag = `zq${crypto.randomUUID().slice(0, 6)}`
    const rows = [
      { name: `${tag} Clube`, kind: 'team' as const, isNationalTeam: false },
      { name: `${tag} Seleção`, kind: 'team' as const, isNationalTeam: true },
      { name: `${tag} Atleta`, kind: 'athlete' as const, isNationalTeam: false }
    ].map((t) => ({
      ...t,
      id: crypto.randomUUID(),
      sportId,
      slug: `integration-${crypto.randomUUID()}`,
      searchText: t.name.toLowerCase()
    }))
    try {
      await meu.db.insert(sport).values({
        id: sportId,
        name: `Esporte ${sportId}`,
        slug: `integration-${sportId}`
      })
      await meu.db.insert(team).values(rows)
      const search = (clubsOnly?: boolean) =>
        meu.owner.pubs
          .searchTeams({ sportIds: [sportId], query: tag, clubsOnly })
          .then((list) => list.map((t) => t.name))
      expect(await search(true)).toEqual([`${tag} Clube`])
      expect(await search()).toHaveLength(3)
    } finally {
      await meu.cleanup()
      await meu.db.delete(team).where(
        inArray(
          team.id,
          rows.map((r) => r.id)
        )
      )
      await meu.db.delete(sport).where(eq(sport.id, sportId))
    }
  }
)
