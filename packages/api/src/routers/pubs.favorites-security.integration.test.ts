import { expect, test } from 'bun:test'
import { eq } from '@findsports_oficial/db'
import { user } from '@findsports_oficial/db/schema/auth'
import { bar } from '@findsports_oficial/db/schema/platform'
import { isDisposableTestDatabase } from '@findsports_oficial/db/utils/db-resolver'
import type { Context } from '../context'

const integrationTest = isDisposableTestDatabase() ? test : test.skip

integrationTest(
  'favoritos respeitam atividade e projeção pública',
  async () => {
    const [{ db }, { appRouter }] = await Promise.all([
      import('@findsports_oficial/db'),
      import('./index')
    ])
    const fanId = crypto.randomUUID()
    const ownerId = crypto.randomUUID()
    const barId = crypto.randomUUID()
    const now = new Date()

    await db.insert(user).values([
      {
        id: fanId,
        name: 'Fan de segurança',
        email: `${fanId}@integration.invalid`,
        emailVerified: true,
        role: 'fan',
        onboardingCompleted: true
      },
      {
        id: ownerId,
        name: 'Pub de segurança',
        email: `${ownerId}@integration.invalid`,
        emailVerified: true,
        role: 'pub',
        onboardingCompleted: true
      }
    ])
    await db.insert(bar).values({
      id: barId,
      userId: ownerId,
      name: 'Bar privado',
      address: 'Rua Segura, 1',
      neighborhood: 'Centro',
      city: 'Teste',
      latitude: '-23.55052000',
      longitude: '-46.63330800',
      isActive: false
    })

    const caller = appRouter.createCaller({
      auth: null,
      clientIp: '127.0.0.1',
      session: {
        session: {
          id: crypto.randomUUID(),
          token: crypto.randomUUID(),
          userId: fanId,
          createdAt: now,
          updatedAt: now,
          expiresAt: new Date(now.getTime() + 60_000)
        },
        user: {
          id: fanId,
          name: 'Fan de segurança',
          email: `${fanId}@integration.invalid`,
          emailVerified: true,
          role: 'fan',
          onboardingCompleted: true,
          searchRadiusKm: 3,
          twoFactorEnabled: false,
          createdAt: now,
          updatedAt: now
        }
      }
    } as unknown as Context)

    try {
      await expect(caller.pubs.favorite({ barId })).rejects.toMatchObject({
        code: 'NOT_FOUND'
      })

      await db.update(bar).set({ isActive: true }).where(eq(bar.id, barId))
      await caller.pubs.favorite({ barId })
      const visible = await caller.pubs.getFavorites()
      expect(visible).toHaveLength(1)
      for (const internal of [
        'userId',
        'plan',
        'isActive',
        'ratingCount',
        'ratingPositive',
        'ratingScore'
      ]) {
        expect(Object.hasOwn(visible[0]?.bar ?? {}, internal)).toBe(false)
      }

      await db.update(bar).set({ isActive: false }).where(eq(bar.id, barId))
      expect(await caller.pubs.getFavorites()).toEqual([])

      await db.update(bar).set({ isActive: true }).where(eq(bar.id, barId))
      expect(await caller.pubs.getFavorites()).toHaveLength(1)
    } finally {
      await db.delete(user).where(eq(user.id, fanId))
      await db.delete(user).where(eq(user.id, ownerId))
    }
  }
)
