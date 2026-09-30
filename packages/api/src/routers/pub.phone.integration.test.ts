import { expect, test } from 'bun:test'
import { eq } from '@findsports_oficial/db'
import { user } from '@findsports_oficial/db/schema/auth'
import { bar } from '@findsports_oficial/db/schema/platform'
import { isDisposableTestDatabase } from '@findsports_oficial/db/utils/db-resolver'

/**
 * Telefone de bar no salvamento (WEB-115): número fora do padrão brasileiro é
 * recusado com a mensagem do que está errado, e nada é gravado. O telefone
 * antigo que não muda não trava a edição do resto do perfil.
 */

const integrationTest = isDisposableTestDatabase() ? test : test.skip

/** O telefone do cadastro incoerente de produção: "55" digitado duas vezes. */
const TELEFONE_LEGADO = '+5555512345678'

function contextFor(userId: string, onboardingCompleted: boolean) {
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
        expiresAt: new Date(now.getTime() + 3_600_000),
        ipAddress: null,
        userAgent: null
      },
      user: {
        id: userId,
        name: 'Dono de integração',
        email: `${userId}@integration.invalid`,
        emailVerified: true,
        image: null,
        role: 'pub' as const,
        banned: false,
        onboardingCompleted,
        searchRadiusKm: 3,
        twoFactorEnabled: false,
        createdAt: now,
        updatedAt: now
      }
    }
  }
}

async function seedOwner(withBar: boolean) {
  const [{ db }, { appRouter }] = await Promise.all([
    import('@findsports_oficial/db'),
    import('./index')
  ])
  const ownerId = crypto.randomUUID()
  await db.insert(user).values({
    id: ownerId,
    name: 'Dono de integração',
    email: `${ownerId}@integration.invalid`,
    emailVerified: true,
    role: 'pub',
    onboardingCompleted: withBar
  })
  if (withBar) {
    await db.insert(bar).values({
      userId: ownerId,
      name: 'Bar do telefone',
      address: 'Rua descartável, 1',
      neighborhood: 'Teste',
      city: 'Teste',
      phone: TELEFONE_LEGADO,
      latitude: '-23.55052000',
      longitude: '-46.63330800'
    })
  }
  return {
    db,
    ownerId,
    caller: appRouter.createCaller(contextFor(ownerId, withBar)),
    storedPhone: async () =>
      (
        await db
          .select({ phone: bar.phone })
          .from(bar)
          .where(eq(bar.userId, ownerId))
      )[0]?.phone,
    cleanup: () => db.delete(user).where(eq(user.id, ownerId))
  }
}

integrationTest(
  'updateMe recusa telefone inválido e aceita o válido',
  async () => {
    const ctx = await seedOwner(true)
    try {
      // O formulário reenvia o telefone gravado junto com o resto.
      await ctx.caller.pub.updateMe({ phone: TELEFONE_LEGADO, screenCount: 5 })

      await expect(
        ctx.caller.pub.updateMe({ phone: '+552098844609' })
      ).rejects.toMatchObject({
        code: 'UNPROCESSABLE_CONTENT',
        message: 'DDD 20 não existe. Confira o telefone.'
      })
      expect(await ctx.storedPhone()).toBe(TELEFONE_LEGADO)

      await ctx.caller.pub.updateMe({ phone: '+5511988446094' })
      expect(await ctx.storedPhone()).toBe('+5511988446094')
    } finally {
      await ctx.cleanup()
    }
  }
)

integrationTest(
  'completePub recusa telefone inválido antes de criar o bar',
  async () => {
    const ctx = await seedOwner(false)
    try {
      await expect(
        ctx.caller.onboarding.completePub({
          name: 'Bar novo',
          neighborhood: 'Vila Madalena',
          city: 'São Paulo',
          address: 'Rua Aspicuelta, 123',
          phone: TELEFONE_LEGADO
        })
      ).rejects.toMatchObject({
        code: 'UNPROCESSABLE_CONTENT',
        message: 'Celular deve começar com 9 depois do DDD. Confira o telefone.'
      })
      expect(await ctx.storedPhone()).toBeUndefined()
    } finally {
      await ctx.cleanup()
    }
  }
)
