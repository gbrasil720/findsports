import { expect, test } from 'bun:test'
import { sql } from '@findsports_oficial/db'
import { isDisposableTestDatabase } from '@findsports_oficial/db/utils/db-resolver'
import { contextFor, load } from './integration-seed'

/**
 * Grimório (WEB-384): mudar um feitiço deixa a linha com antes e depois, e a
 * tabela recusa reescrever o que foi gravado.
 */

const integrationTest = isDisposableTestDatabase() ? test : test.skip

const KEY = 'rating.public_display'

integrationTest(
  'feitiço lançado e desfeito fica no Grimório com antes e depois',
  async () => {
    const { appRouter } = await load()
    const { resetAppConfig } = await import('../lib/app-config')
    const adminId = crypto.randomUUID()
    const caller = appRouter.createCaller(contextFor(adminId, 'admin'))

    try {
      await resetAppConfig(KEY)
      await caller.appConfig.set({ key: KEY, value: true })
      await caller.appConfig.reset({ key: KEY })

      const { entries } = await caller.grimorio.list({
        targetType: 'config',
        targetId: KEY,
        limit: 2
      })
      const mine = entries.filter((e) => e.actorId === adminId)
      expect(mine.map((e) => e.kind)).toEqual(['config.reset', 'config.set'])
      expect(mine[1]).toMatchObject({
        actorName: 'Conta admin',
        before: { padrao: true },
        after: { value: true }
      })
      expect(mine[0]).toMatchObject({
        before: { value: true },
        after: { padrao: true }
      })
    } finally {
      await resetAppConfig(KEY)
    }
  }
)

integrationTest('o Grimório recusa UPDATE e DELETE', async () => {
  const { db } = await load()
  const { recordAdminAction } = await import(
    '@findsports_oficial/db/admin-action'
  )
  const targetId = crypto.randomUUID()
  await recordAdminAction({
    kind: 'user.ban',
    actorId: 'a',
    actorName: 'A',
    targetType: 'user',
    targetId,
    targetLabel: 'x@integration.invalid'
  })

  // O Drizzle embrulha o erro do Postgres; a mensagem da trigger vem no `cause`.
  const refused = async (query: ReturnType<typeof sql>) => {
    const error = await (async () => db.execute(query))().then(
      () => null,
      (e: Error & { cause?: Error }) => e
    )
    return error?.cause?.message ?? error?.message ?? 'aceitou'
  }
  expect(
    await refused(
      sql`UPDATE admin_action SET target_label = 'outro' WHERE target_id = ${targetId}`
    )
  ).toMatch(/só aceita INSERT/)
  expect(
    await refused(sql`DELETE FROM admin_action WHERE target_id = ${targetId}`)
  ).toMatch(/só aceita INSERT/)
})

integrationTest('grimorio.list é só de admin', async () => {
  const { appRouter } = await load()
  const caller = appRouter.createCaller(contextFor(crypto.randomUUID(), 'pub'))
  await expect(caller.grimorio.list({})).rejects.toThrow()
})
