import { expect, test } from 'bun:test'
import { eq } from '@findsports_oficial/db'
import { user } from '@findsports_oficial/db/schema/auth'
import { isDisposableTestDatabase } from '@findsports_oficial/db/utils/db-resolver'
import { contextFor, load, refusal } from './integration-seed'

/**
 * Painel /internal/flags (WEB-346): o `list` diz quem alterou pelo nome, e o
 * `set` recusado devolve o campo e o limite, que é o que a tela mostra.
 */

const integrationTest = isDisposableTestDatabase() ? test : test.skip

const KEY = 'billing.onboarding_trial'

integrationTest(
  'list devolve o nome de quem alterou, o e-mail sem nome e nulo para conta apagada',
  async () => {
    const { db, appRouter } = await load()
    const { resetAppConfig } = await import('../lib/app-config')
    const adminId = crypto.randomUUID()
    const email = `${adminId}@integration.invalid`
    await db.insert(user).values({
      id: adminId,
      name: 'Admin de integração',
      email,
      emailVerified: true,
      role: 'admin'
    })
    const caller = appRouter.createCaller(contextFor(adminId, 'admin'))
    const autor = async () => {
      const entrada = (await caller.appConfig.list()).find((e) => e.key === KEY)
      return { id: entrada?.updatedBy, nome: entrada?.updatedByNome }
    }

    try {
      expect(await autor()).toEqual({ id: null, nome: null })

      await caller.appConfig.set({
        key: KEY,
        value: { enabled: true, plan: 'elite', days: 30 }
      })
      expect(await autor()).toEqual({
        id: adminId,
        nome: 'Admin de integração'
      })

      await db.update(user).set({ name: ' ' }).where(eq(user.id, adminId))
      expect(await autor()).toEqual({ id: adminId, nome: email })

      // `updated_by` não tem chave estrangeira: o id fica, o nome some.
      await db.delete(user).where(eq(user.id, adminId))
      expect(await autor()).toEqual({ id: adminId, nome: null })
    } finally {
      await resetAppConfig(KEY)
      await db.delete(user).where(eq(user.id, adminId))
    }
  }
)

integrationTest(
  'set recusa valor fora do limite dizendo o campo, e não grava',
  async () => {
    const { appRouter } = await load()
    const caller = appRouter.createCaller(
      contextFor(crypto.randomUUID(), 'admin')
    )

    expect(
      await refusal(
        caller.appConfig.set({
          key: KEY,
          value: { enabled: true, plan: 'elite', days: 365 }
        })
      )
    ).toEqual({
      code: 'BAD_REQUEST',
      message: 'days: Grande demais: esperava que o número fosse <= 180'
    })
    expect(
      await refusal(
        caller.appConfig.set({
          key: KEY,
          value: { enabled: true, plan: 'premium', days: 30 }
        })
      )
    ).toEqual({
      code: 'BAD_REQUEST',
      message:
        'plan: Opção inválida: esperava uma das seguintes opções: "starter"|"pro"|"elite"'
    })

    const entrada = (await caller.appConfig.list()).find((e) => e.key === KEY)
    expect(entrada?.sobrescrito).toBe(false)
  }
)
