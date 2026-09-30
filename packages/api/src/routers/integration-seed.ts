import { eq } from '@findsports_oficial/db'
import { user } from '@findsports_oficial/db/schema/auth'
import { bar, subscription } from '@findsports_oficial/db/schema/platform'
import type { AppRouter } from './index'

/**
 * Seed compartilhado dos testes de integração da API: contexto de sessão
 * fabricado e um bar ativo com dono, torcedor e assinatura. Só roda contra o
 * banco descartável — os arquivos `*.integration.test.ts` decidem isso.
 */

type Role = 'pub' | 'fan'
type Plan = 'starter' | 'pro' | 'elite'
type Status = 'trialing' | 'active' | 'past_due'
type Caller = ReturnType<AppRouter['createCaller']>

export function contextFor(userId: string, role: Role, now = new Date()) {
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
        name: `Conta ${role}`,
        email: `${userId}@integration.invalid`,
        emailVerified: true,
        image: null,
        role,
        banned: false,
        onboardingCompleted: true,
        searchRadiusKm: 3,
        twoFactorEnabled: false,
        createdAt: now,
        updatedAt: now
      }
    }
  }
}

// Import dinâmico: o banco só é resolvido quando um teste de integração roda.
export async function load() {
  const [{ db }, { appRouter }] = await Promise.all([
    import('@findsports_oficial/db'),
    import('./index')
  ])
  return { db, appRouter }
}

export const inAMonth = () => new Date(Date.now() + 30 * 24 * 3_600_000)

/** Cria dono + bar ativo + assinatura e devolve o que o teste precisa limpar. */
export async function seedBar(
  plan: Plan,
  status: Status,
  currentPeriodEnd: Date | null
): Promise<{
  db: Awaited<ReturnType<typeof load>>['db']
  barId: string
  owner: Caller
  fan: Caller
  fanId: string
  cleanup: () => Promise<void>
}> {
  const { db, appRouter } = await load()
  const ownerId = crypto.randomUUID()
  const fanId = crypto.randomUUID()
  const barId = crypto.randomUUID()

  await db.insert(user).values([
    {
      id: ownerId,
      name: 'Dono de integração',
      email: `${ownerId}@integration.invalid`,
      emailVerified: true,
      role: 'pub',
      onboardingCompleted: true
    },
    {
      id: fanId,
      name: 'Torcedor de integração',
      email: `${fanId}@integration.invalid`,
      emailVerified: true,
      role: 'fan',
      onboardingCompleted: true
    }
  ])
  await db.insert(bar).values({
    id: barId,
    userId: ownerId,
    name: 'Bar de integração',
    address: 'Rua descartável, 1',
    neighborhood: 'Teste',
    city: 'Teste',
    latitude: '-23.55052000',
    longitude: '-46.63330800',
    isActive: true
  })
  await db
    .insert(subscription)
    .values({ barId, plan, status, currentPeriodEnd })

  return {
    db,
    barId,
    owner: appRouter.createCaller(contextFor(ownerId, 'pub')),
    fan: appRouter.createCaller(contextFor(fanId, 'fan')),
    fanId,
    cleanup: async () => {
      await db.delete(user).where(eq(user.id, ownerId))
      await db.delete(user).where(eq(user.id, fanId))
    }
  }
}

export async function storedOffer(barId: string) {
  const { db } = await load()
  const [row] = await db
    .select({ houseOffer: bar.houseOffer })
    .from(bar)
    .where(eq(bar.id, barId))
  return row?.houseOffer ?? null
}
