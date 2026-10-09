import { expect, spyOn, test } from 'bun:test'
import { eq } from '@findsports_oficial/db'
import { user } from '@findsports_oficial/db/schema/auth'
import { bar } from '@findsports_oficial/db/schema/platform'
import { isDisposableTestDatabase } from '@findsports_oficial/db/utils/db-resolver'
import { contextFor, load } from './integration-seed'

/**
 * WEB-324: a sessão pode vir do cookie cache, até 60s atrasada. Segundo envio
 * do onboarding com `onboardingCompleted: false` na sessão e `true` no banco
 * tem de ser recusado pelo banco, antes de qualquer gravação ou chamada paga.
 */

const integrationTest = isDisposableTestDatabase() ? test : test.skip

const JA_CONCLUIDO = { code: 'CONFLICT', message: 'Onboarding já concluído.' }

/** Conta com o onboarding concluído no banco e sessão que ainda não sabe. */
async function seedStale(role: 'pub' | 'fan') {
  const { db, appRouter } = await load()
  const id = crypto.randomUUID()
  await db.insert(user).values({
    id,
    name: 'Sessão desatualizada',
    email: `${id}@integration.invalid`,
    emailVerified: true,
    role,
    onboardingCompleted: true,
    searchRadiusKm: 10
  })
  return {
    db,
    id,
    caller: appRouter.createCaller(
      contextFor(id, role, new Date(), { onboardingCompleted: false })
    ),
    cleanup: () => db.delete(user).where(eq(user.id, id))
  }
}

integrationTest(
  'completePub com sessão desatualizada recusa antes do geocoding',
  async () => {
    const ctx = await seedStale('pub')
    const fetchSpy = spyOn(globalThis, 'fetch')
    try {
      await expect(
        ctx.caller.onboarding.completePub({
          name: 'Bar repetido',
          neighborhood: 'Vila Madalena',
          city: 'São Paulo',
          address: 'Rua Aspicuelta, 123'
        })
      ).rejects.toMatchObject(JA_CONCLUIDO)
      expect(fetchSpy).not.toHaveBeenCalled()
      expect(
        await ctx.db
          .select({ id: bar.id })
          .from(bar)
          .where(eq(bar.userId, ctx.id))
      ).toEqual([])
    } finally {
      fetchSpy.mockRestore()
      await ctx.cleanup()
    }
  }
)

integrationTest(
  'completeFan com sessão desatualizada recusa sem regravar preferências',
  async () => {
    const ctx = await seedStale('fan')
    try {
      await expect(
        ctx.caller.onboarding.completeFan({
          sportIds: [crypto.randomUUID()],
          searchRadiusKm: 1
        })
      ).rejects.toMatchObject(JA_CONCLUIDO)
      const [row] = await ctx.db
        .select({ radius: user.searchRadiusKm })
        .from(user)
        .where(eq(user.id, ctx.id))
      expect(row?.radius).toBe(10)
    } finally {
      await ctx.cleanup()
    }
  }
)
