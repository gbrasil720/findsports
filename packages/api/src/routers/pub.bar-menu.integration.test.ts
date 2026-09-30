import { expect, test } from 'bun:test'
import { eq } from '@findsports_oficial/db'
import { AVERAGE_SPEND_MAX_CENTS } from '@findsports_oficial/db/bar-menu'
import { user } from '@findsports_oficial/db/schema/auth'
import { bar, subscription } from '@findsports_oficial/db/schema/platform'
import { isDisposableTestDatabase } from '@findsports_oficial/db/utils/db-resolver'

/**
 * Cardápio e gasto médio (WEB-39) contra o banco de verdade: o plano é
 * conferido no servidor a partir da assinatura, cada dono só escreve no
 * próprio bar, o update é parcial, e perder Pro/Elite esconde sem apagar.
 */

const integrationTest = isDisposableTestDatabase() ? test : test.skip

type Role = 'pub' | 'fan'
type Plan = 'starter' | 'pro' | 'elite'
type Status = 'trialing' | 'active' | 'past_due'

function contextFor(userId: string, role: Role, now = new Date()) {
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

async function load() {
  const [{ db }, { appRouter }] = await Promise.all([
    import('@findsports_oficial/db'),
    import('./index')
  ])
  return { db, appRouter }
}

const inAMonth = () => new Date(Date.now() + 30 * 24 * 3_600_000)

/** Cria dono + bar ativo + assinatura, e um torcedor para ler o perfil. */
async function seedBar(plan: Plan, status: Status = 'active') {
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
    name: 'Bar do cardápio',
    description: 'Descrição que não pode sumir',
    address: 'Rua descartável, 1',
    neighborhood: 'Teste',
    city: 'Teste',
    latitude: '-23.55052000',
    longitude: '-46.63330800',
    screenCount: 4,
    isActive: true
  })
  await db
    .insert(subscription)
    .values({ barId, plan, status, currentPeriodEnd: inAMonth() })

  return {
    db,
    barId,
    owner: appRouter.createCaller(contextFor(ownerId, 'pub')),
    fan: appRouter.createCaller(contextFor(fanId, 'fan')),
    setPlan: (next: Plan) =>
      db
        .update(subscription)
        .set({ plan: next })
        .where(eq(subscription.barId, barId)),
    cleanup: async () => {
      await db.delete(user).where(eq(user.id, ownerId))
      await db.delete(user).where(eq(user.id, fanId))
    }
  }
}

async function stored(barId: string) {
  const { db } = await load()
  const [row] = await db
    .select({
      menuUrl: bar.menuUrl,
      averageSpendCents: bar.averageSpendCents,
      description: bar.description,
      screenCount: bar.screenCount
    })
    .from(bar)
    .where(eq(bar.id, barId))
  return row
}

const MENU = 'https://bar.com.br/cardapio'

for (const plan of ['pro', 'elite'] as const) {
  integrationTest(
    `dono ${plan} salva, edita e remove; o perfil acompanha`,
    async () => {
      const ctx = await seedBar(plan)
      try {
        const saved = await ctx.owner.pub.updateMenuInfo({
          menuUrl: '  bar.com.br/cardapio ',
          averageSpendCents: 4550
        })
        expect(saved).toEqual({ menuUrl: MENU, averageSpendCents: 4550 })

        const profile = await ctx.fan.pubs.getById({ id: ctx.barId })
        expect(profile.menuUrl).toBe(MENU)
        expect(profile.averageSpendCents).toBe(4550)

        await ctx.owner.pub.updateMenuInfo({ averageSpendCents: 6000 })
        expect(
          (await ctx.fan.pubs.getById({ id: ctx.barId })).averageSpendCents
        ).toBe(6000)

        // Link em branco remove só o link.
        await ctx.owner.pub.updateMenuInfo({ menuUrl: '' })
        expect(await stored(ctx.barId)).toMatchObject({
          menuUrl: null,
          averageSpendCents: 6000
        })

        await ctx.owner.pub.updateMenuInfo({ averageSpendCents: null })
        const cleared = await ctx.fan.pubs.getById({ id: ctx.barId })
        expect(cleared.menuUrl).toBeNull()
        expect(cleared.averageSpendCents).toBeNull()
      } finally {
        await ctx.cleanup()
      }
    }
  )
}

integrationTest(
  'update parcial não sobrescreve o outro campo nem o resto do bar',
  async () => {
    const ctx = await seedBar('pro')
    try {
      await ctx.owner.pub.updateMenuInfo({
        menuUrl: MENU,
        averageSpendCents: 4550
      })
      await ctx.owner.pub.updateMenuInfo({
        menuUrl: 'https://outro.com.br/menu'
      })
      expect(await stored(ctx.barId)).toEqual({
        menuUrl: 'https://outro.com.br/menu',
        averageSpendCents: 4550,
        description: 'Descrição que não pode sumir',
        screenCount: 4
      })

      // `updateMe` não conhece os campos novos e não os apaga.
      await ctx.owner.pub.updateMe({ screenCount: 6 })
      expect(await stored(ctx.barId)).toMatchObject({
        menuUrl: 'https://outro.com.br/menu',
        averageSpendCents: 4550
      })

      await expect(ctx.owner.pub.updateMenuInfo({})).rejects.toMatchObject({
        code: 'BAD_REQUEST'
      })
    } finally {
      await ctx.cleanup()
    }
  }
)

integrationTest(
  'Starter recebe recusa do servidor e nada é gravado',
  async () => {
    const ctx = await seedBar('starter')
    try {
      await expect(
        ctx.owner.pub.updateMenuInfo({ menuUrl: MENU, averageSpendCents: 4550 })
      ).rejects.toMatchObject({ code: 'FORBIDDEN' })
      expect(await stored(ctx.barId)).toMatchObject({
        menuUrl: null,
        averageSpendCents: null
      })
    } finally {
      await ctx.cleanup()
    }
  }
)

integrationTest('Pro em past_due não grava', async () => {
  const ctx = await seedBar('pro', 'past_due')
  try {
    await expect(
      ctx.owner.pub.updateMenuInfo({ averageSpendCents: 4550 })
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  } finally {
    await ctx.cleanup()
  }
})

integrationTest(
  'torcedor e dono de outro bar não alteram os dados',
  async () => {
    const a = await seedBar('elite')
    const b = await seedBar('elite')
    try {
      await a.owner.pub.updateMenuInfo({
        menuUrl: MENU,
        averageSpendCents: 4550
      })

      await expect(
        a.fan.pub.updateMenuInfo({ averageSpendCents: 100 })
      ).rejects.toMatchObject({ code: 'FORBIDDEN' })

      // Não há como apontar outro bar: o procedimento só escreve no bar da
      // sessão. O dono de B mexe no B e o A fica igual.
      await b.owner.pub.updateMenuInfo({ averageSpendCents: 100 })
      expect(await stored(a.barId)).toMatchObject({
        menuUrl: MENU,
        averageSpendCents: 4550
      })
      expect(await stored(b.barId)).toMatchObject({ averageSpendCents: 100 })
    } finally {
      await a.cleanup()
      await b.cleanup()
    }
  }
)

integrationTest(
  'link e valor inválidos são recusados e nada é gravado',
  async () => {
    const ctx = await seedBar('pro')
    try {
      for (const menuUrl of [
        'javascript:alert(1)',
        'data:text/html,oi',
        'ftp://bar.com/menu',
        'https://banco.com@golpe.site'
      ]) {
        await expect(
          ctx.owner.pub.updateMenuInfo({ menuUrl })
        ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
      }
      for (const averageSpendCents of [
        0,
        -100,
        45.5,
        AVERAGE_SPEND_MAX_CENTS + 1
      ]) {
        await expect(
          ctx.owner.pub.updateMenuInfo({ averageSpendCents })
        ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
      }
      expect(await stored(ctx.barId)).toMatchObject({
        menuUrl: null,
        averageSpendCents: null
      })
    } finally {
      await ctx.cleanup()
    }
  }
)

integrationTest('o banco recusa valores gravados por fora', async () => {
  const ctx = await seedBar('pro')
  try {
    // O builder do Drizzle é thenable, não Promise: `rejects` precisa de uma.
    const write = (values: Partial<typeof bar.$inferInsert>) =>
      (async () => {
        await ctx.db.update(bar).set(values).where(eq(bar.id, ctx.barId))
      })()

    await expect(write({ menuUrl: '' })).rejects.toThrow()
    await expect(write({ menuUrl: 'javascript:alert(1)' })).rejects.toThrow()
    await expect(write({ averageSpendCents: 0 })).rejects.toThrow()
    await expect(
      write({ averageSpendCents: AVERAGE_SPEND_MAX_CENTS + 1 })
    ).rejects.toThrow()
  } finally {
    await ctx.cleanup()
  }
})

integrationTest(
  'downgrade esconde sem apagar; upgrade restaura sem novo preenchimento',
  async () => {
    const ctx = await seedBar('pro')
    try {
      await ctx.owner.pub.updateMenuInfo({
        menuUrl: MENU,
        averageSpendCents: 4550
      })

      await ctx.setPlan('starter')
      const hidden = await ctx.fan.pubs.getById({ id: ctx.barId })
      expect(hidden.menuUrl).toBeNull()
      expect(hidden.averageSpendCents).toBeNull()
      // A prévia do dono é o que o torcedor vê.
      expect(
        (await ctx.owner.pubs.getById({ id: ctx.barId })).menuUrl
      ).toBeNull()
      // O painel continua lendo o que está guardado.
      const me = await ctx.owner.pub.getMe()
      expect(me.menuUrl).toBe(MENU)
      expect(me.averageSpendCents).toBe(4550)
      // Sem plano, nem remover passa.
      await expect(
        ctx.owner.pub.updateMenuInfo({ menuUrl: null })
      ).rejects.toMatchObject({ code: 'FORBIDDEN' })

      await ctx.setPlan('elite')
      const restored = await ctx.fan.pubs.getById({ id: ctx.barId })
      expect(restored.menuUrl).toBe(MENU)
      expect(restored.averageSpendCents).toBe(4550)
    } finally {
      await ctx.cleanup()
    }
  }
)

integrationTest(
  'payload público não leva assinatura e perfil antigo vem com nulos',
  async () => {
    const ctx = await seedBar('elite')
    try {
      const profile = await ctx.fan.pubs.getById({ id: ctx.barId })
      expect(profile.menuUrl).toBeNull()
      expect(profile.averageSpendCents).toBeNull()
      expect(profile).not.toHaveProperty('subscription')
      expect(profile).not.toHaveProperty('userId')
    } finally {
      await ctx.cleanup()
    }
  }
)
