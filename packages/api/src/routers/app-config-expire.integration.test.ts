import { expect, test } from 'bun:test'
import { sql } from '@findsports_oficial/db'
import { isDisposableTestDatabase } from '@findsports_oficial/db/utils/db-resolver'
import { contextFor, load } from './integration-seed'

/**
 * Feitiço com prazo (WEB-387): vencido, a leitura volta ao padrão, a linha sai
 * da tabela e a volta fica no Grimório.
 */

const integrationTest = isDisposableTestDatabase() ? test : test.skip

const KEY = 'rating.public_display'

integrationTest(
  'feitiço vencido volta ao padrão e o Grimório anota a volta',
  async () => {
    const { db, appRouter } = await load()
    const { resetAppConfig, expirarFeiticosVencidos } = await import(
      '../lib/app-config'
    )
    const adminId = crypto.randomUUID()
    const caller = appRouter.createCaller(contextFor(adminId, 'admin'))

    try {
      await caller.appConfig.set({
        key: KEY,
        value: true,
        expiresInMinutes: 60
      })
      const lancado = (await caller.appConfig.list()).find((e) => e.key === KEY)
      expect(lancado?.valor).toBe(true)
      expect(lancado?.expiresAt).not.toBeNull()

      // O prazo passou.
      await db.execute(
        sql`UPDATE app_config SET expires_at = NOW() - interval '1 minute' WHERE key = ${KEY}`
      )
      const vencido = (await caller.appConfig.list()).find((e) => e.key === KEY)
      expect(vencido).toMatchObject({ valor: false, sobrescrito: false })

      expect(await expirarFeiticosVencidos()).toEqual([KEY])
      expect(await expirarFeiticosVencidos()).toEqual([])

      const { entries } = await caller.grimorio.list({
        kinds: ['config.expire'],
        targetId: KEY,
        limit: 1
      })
      expect(entries[0]).toMatchObject({
        actorName: 'Houdini',
        before: { value: true },
        after: { padrao: true }
      })
    } finally {
      await resetAppConfig(KEY)
    }
  }
)

integrationTest('sem prazo, o feitiço não vence', async () => {
  const { appRouter } = await load()
  const { resetAppConfig, expirarFeiticosVencidos } = await import(
    '../lib/app-config'
  )
  const caller = appRouter.createCaller(
    contextFor(crypto.randomUUID(), 'admin')
  )
  try {
    await caller.appConfig.set({ key: KEY, value: true })
    expect(await expirarFeiticosVencidos()).toEqual([])
    const entrada = (await caller.appConfig.list()).find((e) => e.key === KEY)
    expect(entrada).toMatchObject({ valor: true, expiresAt: null })
  } finally {
    await resetAppConfig(KEY)
  }
})
