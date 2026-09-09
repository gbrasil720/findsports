import { expect, test } from 'bun:test'
import { eq, inArray } from '@findsports_oficial/db'
import { user } from '@findsports_oficial/db/schema/auth'
import { bar, subscription } from '@findsports_oficial/db/schema/platform'
import { supportRequest } from '@findsports_oficial/db/schema/support'
import { isDisposableTestDatabase } from '@findsports_oficial/db/utils/db-resolver'

import type { Context } from '../context'

const integrationTest = isDisposableTestDatabase() ? test : test.skip

function contextFor(userId: string, role: 'pub' | 'admin', now: Date): Context {
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
        expiresAt: new Date(now.getTime() + 3_600_000),
        ipAddress: null,
        userAgent: null
      },
      user: {
        id: userId,
        name: `Usuário ${role}`,
        email: `${userId}@integration.invalid`,
        emailVerified: true,
        image: null,
        role,
        banned: false,
        onboardingCompleted: true,
        admittedAt: now,
        searchRadiusKm: 3,
        twoFactorEnabled: false,
        createdAt: now,
        updatedAt: now
      }
    }
  } as Context
}

integrationTest(
  'prioridade usa o plano vigente, isola o bar e ordena a fila',
  async () => {
    const [{ db }, { appRouter }] = await Promise.all([
      import('@findsports_oficial/db'),
      import('./index')
    ])
    const now = new Date()
    const userIds = [
      crypto.randomUUID(),
      crypto.randomUUID(),
      crypto.randomUUID(),
      crypto.randomUUID()
    ]
    const starterUserId = userIds[0] as string
    const proUserId = userIds[1] as string
    const adminUserId = userIds[3] as string
    const barIds = [
      crypto.randomUUID(),
      crypto.randomUUID(),
      crypto.randomUUID()
    ]
    const starterBarId = barIds[0] as string
    const proBarId = barIds[1] as string
    const eliteBarId = barIds[2] as string
    const eliteRequestId = crypto.randomUUID()
    const proRequestId = crypto.randomUUID()

    await db.insert(user).values(
      userIds.map((id, index) => ({
        id,
        name: `Usuário de suporte ${index}`,
        email: `${id}@integration.invalid`,
        emailVerified: true,
        role: index === 3 ? ('admin' as const) : ('pub' as const),
        onboardingCompleted: true,
        admittedAt: now
      }))
    )

    try {
      await db.insert(bar).values(
        barIds.map((id, index) => ({
          id,
          userId: userIds[index] as string,
          name: `Bar de suporte ${index}`,
          address: 'Rua descartável, 1',
          neighborhood: 'Teste',
          city: 'Teste',
          latitude: '-23.55052000',
          longitude: '-46.63330800',
          isActive: true
        }))
      )
      await db.insert(subscription).values([
        {
          barId: starterBarId,
          plan: 'starter' as const,
          status: 'active' as const
        },
        { barId: proBarId, plan: 'pro' as const, status: 'active' as const },
        { barId: eliteBarId, plan: 'elite' as const, status: 'active' as const }
      ])
      await db
        .update(subscription)
        .set({ status: 'trialing', currentPeriodEnd: null })
        .where(eq(subscription.barId, starterBarId))
      await db.insert(supportRequest).values([
        {
          id: eliteRequestId,
          barId: eliteBarId,
          subject: 'Solicitação Elite',
          category: 'account' as const,
          description: 'Solicitação antiga do bar Elite.',
          createdAt: new Date(now.getTime() - 2 * 3_600_000)
        },
        {
          id: proRequestId,
          barId: proBarId,
          subject: 'Solicitação Pro',
          category: 'billing' as const,
          description: 'Solicitação antiga do bar Pro.',
          createdAt: new Date(now.getTime() - 3 * 3_600_000)
        }
      ])

      const starterCaller = appRouter.createCaller(
        contextFor(starterUserId as string, 'pub', now)
      )
      const proCaller = appRouter.createCaller(
        contextFor(proUserId as string, 'pub', now)
      )
      const adminCaller = appRouter.createCaller(
        contextFor(adminUserId as string, 'admin', now)
      )

      const createWithClientOnlyPriority = starterCaller.support
        .create as unknown as (
        input: Record<string, unknown>
      ) => Promise<{ id: string; plan: string; priority: string }>
      const created = await createWithClientOnlyPriority({
        subject: 'Ajuda com a conta',
        category: 'account',
        description:
          'A solicitação deve ignorar o plano enviado pelo navegador.',
        plan: 'elite',
        priority: 'highest'
      })

      expect(created.plan).toBe('starter')
      expect(created.priority).toBe('standard')
      await db
        .update(subscription)
        .set({
          status: 'past_due',
          currentPeriodEnd: new Date(now.getTime() + 3_600_000)
        })
        .where(eq(subscription.barId, starterBarId))
      const starterRequests = await starterCaller.support.listMine()
      const proRequests = await proCaller.support.listMine()
      expect(starterRequests.map((request) => request.id)).toEqual([created.id])
      expect(starterRequests[0]).toMatchObject({
        plan: 'starter',
        priority: 'standard'
      })
      expect(proRequests.map((request) => request.id)).toEqual([proRequestId])

      const queue = await adminCaller.support.listQueue({ limit: 500 })
      const userIdSet = new Set<string>(userIds)
      const ours = queue.filter((request) =>
        userIdSet.has(request.barEmail.split('@')[0] ?? '')
      )
      expect(ours.map((request) => request.id)).toEqual([
        eliteRequestId,
        proRequestId,
        created.id
      ])

      await adminCaller.support.updateStatus({
        id: eliteRequestId,
        status: 'in_progress'
      })
      const updatedQueue = await adminCaller.support.listQueue({ limit: 500 })
      const updatedElite = updatedQueue.find(
        (request) => request.id === eliteRequestId
      )
      expect(updatedElite?.status).toBe('in_progress')

      await db
        .update(subscription)
        .set({ status: 'cancelled' })
        .where(eq(subscription.barId, eliteBarId))
      const downgradedQueue = await adminCaller.support.listQueue({
        limit: 500
      })
      const downgradedElite = downgradedQueue.find(
        (request) => request.id === eliteRequestId
      )
      expect(downgradedElite).toMatchObject({
        plan: 'starter',
        priority: 'standard',
        status: 'in_progress'
      })
    } finally {
      await db.delete(user).where(inArray(user.id, userIds))
    }
  }
)
