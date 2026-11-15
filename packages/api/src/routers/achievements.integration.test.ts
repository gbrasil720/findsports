import { expect, test } from 'bun:test'
import { eq } from '@findsports_oficial/db'
import { secretAchievement } from '@findsports_oficial/db/schema/achievement'
import { user } from '@findsports_oficial/db/schema/auth'
import { isDisposableTestDatabase } from '@findsports_oficial/db/utils/db-resolver'
import { contextFor, load } from './integration-seed'

/**
 * "Achou o Jules" (WEB-558): a conquista secreta fica gravada por pessoa,
 * uma vez só, e aparece em `achievements.mine` com a data em que achou.
 */
const integrationTest = isDisposableTestDatabase() ? test : test.skip

integrationTest('achar o Jules grava uma vez e libera a medalha', async () => {
  const { db, appRouter } = await load()
  const id = crypto.randomUUID()
  await db.insert(user).values({
    id,
    name: 'Achou o Jules',
    email: `${id}@integration.invalid`,
    emailVerified: true,
    role: 'fan',
    onboardingCompleted: true
  })
  try {
    const fan = appRouter.createCaller(contextFor(id, 'fan'))
    const antes = await fan.achievements.mine()
    expect(
      antes.achievements.find((a) => a.id === 'jules')?.unlockedAt
    ).toBeNull()

    expect(await fan.achievements.findJules({ via: 'web' })).toEqual({
      isNew: true
    })
    // Achar de novo, pelo app, não abre a conquista outra vez.
    expect(await fan.achievements.findJules({ via: 'app' })).toEqual({
      isNew: false
    })
    const linhas = await db
      .select()
      .from(secretAchievement)
      .where(eq(secretAchievement.userId, id))
    expect(linhas).toHaveLength(1)
    expect(linhas[0]?.via).toBe('web')

    const depois = await fan.achievements.mine()
    const jules = depois.achievements.find((a) => a.id === 'jules')
    expect(jules?.unlockedAt).toEqual(linhas[0]?.foundAt as Date)
    expect(depois.level.unlocked).toBe(1)
    expect(jules?.share).toBeGreaterThan(0)
  } finally {
    // A conquista sai junto com a conta (cascade).
    await db.delete(user).where(eq(user.id, id))
  }
})
