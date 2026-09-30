import { expect, test } from 'bun:test'
import { eq } from '@findsports_oficial/db'
import { user } from '@findsports_oficial/db/schema/auth'
import { bar } from '@findsports_oficial/db/schema/platform'
import { isDisposableTestDatabase } from '@findsports_oficial/db/utils/db-resolver'
import { contextFor, load } from './integration-seed'

/**
 * Telefone de bar no salvamento (WEB-115): número fora do padrão brasileiro é
 * recusado com a mensagem do que está errado, e nada é gravado. O telefone
 * antigo que não muda não trava a edição do resto do perfil.
 */

const integrationTest = isDisposableTestDatabase() ? test : test.skip

/** O telefone do cadastro incoerente de produção: "55" digitado duas vezes. */
const TELEFONE_LEGADO = '+5555512345678'

async function seedOwner(withBar: boolean) {
  const { db, appRouter } = await load()
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
    caller: appRouter.createCaller(
      contextFor(ownerId, 'pub', new Date(), withBar)
    ),
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

integrationTest(
  'completePub recusa cidade fora do lançamento sem dizer que falta permissão',
  async () => {
    const ctx = await seedOwner(false)
    const { resetAppConfig, setAppConfig } = await import('../lib/app-config')
    await setAppConfig('launch.pub_cities', ['Curitiba'], null)
    try {
      // `FORBIDDEN` o app traduz em "sem permissão"; aqui falta a cidade abrir.
      await expect(
        ctx.caller.onboarding.completePub({
          name: 'Bar novo',
          neighborhood: 'Vila Madalena',
          city: 'São Paulo',
          address: 'Rua Aspicuelta, 123'
        })
      ).rejects.toMatchObject({
        code: 'PRECONDITION_FAILED',
        message:
          'A Onside ainda não abriu em São Paulo. Avisamos assim que chegarmos aí.'
      })
      expect(await ctx.storedPhone()).toBeUndefined()
    } finally {
      await resetAppConfig('launch.pub_cities')
      await ctx.cleanup()
    }
  }
)
