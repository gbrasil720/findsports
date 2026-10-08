import { expect, test } from 'bun:test'
import { eq, inArray } from '@findsports_oficial/db'
import { user } from '@findsports_oficial/db/schema/auth'
import {
  sport,
  team,
  userFavoriteTeams
} from '@findsports_oficial/db/schema/platform'
import { isDisposableTestDatabase } from '@findsports_oficial/db/utils/db-resolver'
import { contextFor, load } from './integration-seed'

const integrationTest = isDisposableTestDatabase() ? test : test.skip

integrationTest(
  'times favoritos ficam dentro dos esportes do torcedor (WEB-68)',
  async () => {
    const { db, appRouter } = await load()
    const suffix = crypto.randomUUID()
    const footballId = crypto.randomUUID()
    const f1Id = crypto.randomUUID()
    const clubId = crypto.randomUUID()
    const otherClubId = crypto.randomUUID()
    const constructorId = crypto.randomUUID()
    const withTeamsId = crypto.randomUUID()
    const withoutTeamsId = crypto.randomUUID()

    await db.insert(sport).values([
      { id: footballId, name: 'Futebol', slug: `futebol-${suffix}` },
      { id: f1Id, name: 'F1', slug: `f1-${suffix}` }
    ])
    await db.insert(team).values([
      { id: clubId, sportId: footballId, name: 'PSG', slug: `a-${suffix}` },
      {
        id: otherClubId,
        sportId: footballId,
        name: 'Palmeiras',
        slug: `b-${suffix}`
      },
      {
        id: crypto.randomUUID(),
        sportId: footballId,
        name: 'Água Santa',
        slug: `d-${suffix}`
      },
      { id: constructorId, sportId: f1Id, name: 'C', slug: `c-${suffix}` }
    ])
    await db.insert(user).values(
      [withTeamsId, withoutTeamsId].map((id) => ({
        id,
        name: 'Fan de times',
        email: `${id}@integration.invalid`,
        emailVerified: true,
        role: 'fan' as const
      }))
    )

    const fan = appRouter.createCaller(
      contextFor(withTeamsId, 'fan', new Date(), { onboardingCompleted: false })
    )
    const teamIds = async () =>
      (await fan.pubs.getMyTeams()).map((row) => row.id).sort()

    try {
      // Onboarding recusa time de esporte que o torcedor não marcou, e a
      // transação inteira volta: nem esporte nem onboarding ficam gravados.
      await expect(
        fan.onboarding.completeFan({
          sportIds: [footballId],
          searchRadiusKm: 3,
          teamIds: [clubId, constructorId]
        })
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
      expect(await fan.pubs.getMyPreferences()).toEqual([])

      await fan.onboarding.completeFan({
        sportIds: [footballId, f1Id],
        searchRadiusKm: 3,
        teamIds: [clubId, constructorId]
      })
      expect(await teamIds()).toEqual([clubId, constructorId].sort())

      // Sem times: onboarding conclui do mesmo jeito.
      await appRouter
        .createCaller(
          contextFor(withoutTeamsId, 'fan', new Date(), {
            onboardingCompleted: false
          })
        )
        .onboarding.completeFan({ sportIds: [footballId], searchRadiusKm: 5 })
      const [withoutTeams] = await db
        .select({ done: user.onboardingCompleted })
        .from(user)
        .where(eq(user.id, withoutTeamsId))
      expect(withoutTeams?.done).toBe(true)

      await fan.pubs.updateMyTeams({
        teamIds: [clubId, otherClubId, constructorId]
      })

      // WEB-284: ordem alfabética em pt-BR, não a de bytes do banco — que
      // poria "PSG" antes de "Palmeiras" e "Água Santa" no fim.
      const nomes = (rows: { name: string }[]) => rows.map((row) => row.name)
      expect(
        nomes(await fan.pubs.getTeamsBySport({ sportId: footballId }))
      ).toEqual(['Água Santa', 'Palmeiras', 'PSG'])
      expect(nomes(await fan.pubs.getMyTeams())).toEqual([
        'C',
        'Palmeiras',
        'PSG'
      ])

      // Remover F1 leva a escuderia junto e preserva os times do futebol.
      await fan.pubs.updateMyPreferences({ sportIds: [footballId] })
      expect(await teamIds()).toEqual([clubId, otherClubId].sort())

      // Chamada direta com time de esporte desmarcado é recusada.
      await expect(
        fan.pubs.updateMyTeams({ teamIds: [clubId, constructorId] })
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
      expect(await teamIds()).toEqual([clubId, otherClubId].sort())

      // O banco segura o mesmo invariante quando a checagem é contornada.
      await expect(
        db
          .insert(userFavoriteTeams)
          .values({
            userId: withTeamsId,
            sportId: f1Id,
            teamId: constructorId
          })
          .execute()
      ).rejects.toThrow()

      await fan.pubs.updateMyTeams({ teamIds: [] })
      expect(await teamIds()).toEqual([])
    } finally {
      await db
        .delete(user)
        .where(inArray(user.id, [withTeamsId, withoutTeamsId]))
      await db.delete(sport).where(inArray(sport.id, [footballId, f1Id]))
    }
  }
)
