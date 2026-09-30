import { expect, test } from 'bun:test'
import { eq, inArray } from '@findsports_oficial/db'
import { user } from '@findsports_oficial/db/schema/auth'
import {
  sport,
  team,
  userFavoriteTeams
} from '@findsports_oficial/db/schema/platform'
import { isDisposableTestDatabase } from '@findsports_oficial/db/utils/db-resolver'
import type { Context } from '../context'

const integrationTest = isDisposableTestDatabase() ? test : test.skip

function fanContext(userId: string): Context {
  const now = new Date()
  return {
    auth: null,
    clientIp: '127.0.0.1',
    session: {
      session: {
        id: crypto.randomUUID(),
        token: crypto.randomUUID(),
        userId,
        createdAt: now,
        updatedAt: now,
        expiresAt: new Date(now.getTime() + 60_000)
      },
      user: {
        id: userId,
        name: 'Fan de times',
        email: `${userId}@integration.invalid`,
        emailVerified: true,
        role: 'fan',
        onboardingCompleted: false,
        searchRadiusKm: 3,
        twoFactorEnabled: false,
        createdAt: now,
        updatedAt: now
      }
    }
  } as unknown as Context
}

integrationTest(
  'times favoritos ficam dentro dos esportes do torcedor (WEB-68)',
  async () => {
    const [{ db }, { appRouter }] = await Promise.all([
      import('@findsports_oficial/db'),
      import('./index')
    ])
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
      { id: clubId, sportId: footballId, name: 'A', slug: `a-${suffix}` },
      { id: otherClubId, sportId: footballId, name: 'B', slug: `b-${suffix}` },
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

    const fan = appRouter.createCaller(fanContext(withTeamsId))
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
        .createCaller(fanContext(withoutTeamsId))
        .onboarding.completeFan({ sportIds: [footballId], searchRadiusKm: 5 })
      const [withoutTeams] = await db
        .select({ done: user.onboardingCompleted })
        .from(user)
        .where(eq(user.id, withoutTeamsId))
      expect(withoutTeams?.done).toBe(true)

      await fan.pubs.updateMyTeams({
        teamIds: [clubId, otherClubId, constructorId]
      })

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
