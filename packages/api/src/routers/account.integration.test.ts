import { expect, test } from 'bun:test'
import { inArray } from '@findsports_oficial/db'
import { attendance } from '@findsports_oficial/db/schema/attendance'
import { user } from '@findsports_oficial/db/schema/auth'
import { userFavoriteBars } from '@findsports_oficial/db/schema/platform'
import { barRating } from '@findsports_oficial/db/schema/rating'
import { friendship } from '@findsports_oficial/db/schema/social'
import { isDisposableTestDatabase } from '@findsports_oficial/db/utils/db-resolver'
import { contextFor, load, seedBar } from './integration-seed'

/**
 * "Baixar meus dados" (11i, WEB-419): o arquivo traz a conta inteira de quem
 * pede e nada de outra pessoa além do nome e do `@` de quem é amigo.
 */
const integrationTest = isDisposableTestDatabase() ? test : test.skip

integrationTest('exportar meus dados', async () => {
  const ctx = await seedBar('elite', 'active', null)
  const { db } = ctx
  const { appRouter } = await load()
  const tag = crypto.randomUUID().slice(0, 8)
  const friend = {
    id: crypto.randomUUID(),
    name: `Amiga ${tag}`,
    email: `amiga-${tag}@integration.invalid`,
    emailVerified: true,
    role: 'fan' as const,
    onboardingCompleted: true
  }
  try {
    await db.insert(user).values(friend)
    const past = await ctx.seedGame({
      startsAt: new Date(Date.now() - 2 * 86_400_000)
    })
    const me = ctx.fanId
    await db.insert(attendance).values([
      { userId: me, eventId: past },
      // A presença da amiga não é do torcedor: não sai no arquivo dele.
      { userId: friend.id, eventId: past }
    ])
    await db.insert(barRating).values({
      barId: ctx.barId,
      actorUserId: me,
      eventId: past,
      wouldReturn: true
    })
    await db.insert(userFavoriteBars).values({ userId: me, barId: ctx.barId })
    await db.insert(friendship).values({
      requesterId: friend.id,
      addresseeId: me,
      via: 'code',
      acceptedAt: new Date()
    })

    const data = await appRouter
      .createCaller(contextFor(me, 'fan'))
      .account.exportData()
    expect(data.profile?.id).toBe(me)
    expect(data.profile?.email).toBe(`${me}@integration.invalid`)
    expect(data.favoriteBars.map((f) => f.bar)).toEqual(['Bar de integração'])
    expect(data.games).toHaveLength(1)
    expect(data.ratings.map((r) => r.wouldReturn)).toEqual([true])
    expect(data.friends).toEqual([
      expect.objectContaining({ name: friend.name, status: 'friends' })
    ])
    expect(data.achievements.level).toBeGreaterThanOrEqual(1)
    // Da amiga, só o nome: nem e-mail nem id.
    const wire = JSON.stringify(data)
    expect(wire).not.toContain(friend.email)
    expect(wire).not.toContain(friend.id)

    // Só torcedor exporta por aqui.
    await expect(ctx.owner.account.exportData()).rejects.toThrow('torcedores')
  } finally {
    await db.delete(user).where(inArray(user.id, [friend.id]))
    await ctx.cleanup()
  }
})
