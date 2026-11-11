import { expect, test } from 'bun:test'
import { and, eq } from '@findsports_oficial/db'
import { adminAction } from '@findsports_oficial/db/schema/houdini'
import { isDisposableTestDatabase } from '@findsports_oficial/db/utils/db-resolver'
import { contextFor, load, refusal } from '../routers/integration-seed'
import { resetAppConfig } from './app-config'
import { type AppStatus, appStatusResponse } from './app-status'

/**
 * Manutenção do app (WEB-466) contra o banco: o Houdini liga pelo
 * `appConfig.set`, com o Grimório, e a rota que o app lê responde na hora
 * (gravar derruba o cache da instância).
 */

const integrationTest = isDisposableTestDatabase() ? test : test.skip

const KEY = 'app.maintenance'

async function status() {
  const response = await appStatusResponse()
  expect(response.status).toBe(200)
  expect(response.headers.get('Cache-Control')).toBe('no-store')
  return ((await response.json()) as AppStatus).maintenance
}

integrationTest(
  'o admin liga e desliga, a rota acompanha e o Grimório anota',
  async () => {
    const { db, appRouter } = await load()
    const adminId = crypto.randomUUID()
    const admin = appRouter.createCaller(contextFor(adminId, 'admin'))
    const backAt = '2026-10-29T02:30:00.000Z'

    try {
      expect(await status()).toEqual({ on: false, backAt: null })

      await admin.appConfig.set({ key: KEY, value: { on: true, backAt } })
      expect(await status()).toEqual({ on: true, backAt })

      await admin.appConfig.set({
        key: KEY,
        value: { on: true, backAt: null }
      })
      expect(await status()).toEqual({ on: true, backAt: null })

      await admin.appConfig.set({
        key: KEY,
        value: { on: false, backAt: null }
      })
      expect(await status()).toEqual({ on: false, backAt: null })

      const anotado = await db
        .select({ kind: adminAction.kind, after: adminAction.after })
        .from(adminAction)
        .where(
          and(eq(adminAction.actorId, adminId), eq(adminAction.targetId, KEY))
        )
        .orderBy(adminAction.createdAt)
      expect(anotado).toEqual([
        { kind: 'config.set', after: { value: { on: true, backAt } } },
        { kind: 'config.set', after: { value: { on: true, backAt: null } } },
        { kind: 'config.set', after: { value: { on: false, backAt: null } } }
      ])
    } finally {
      // O Grimório não aceita apagar: as linhas do admin descartável ficam.
      await resetAppConfig(KEY)
    }
  }
)

integrationTest(
  'só o admin liga; previsão sem fuso é recusada e nada grava',
  async () => {
    const { appRouter } = await load()
    const fan = appRouter.createCaller(contextFor(crypto.randomUUID(), 'fan'))
    const admin = appRouter.createCaller(
      contextFor(crypto.randomUUID(), 'admin')
    )

    expect(
      (
        await refusal(
          fan.appConfig.set({ key: KEY, value: { on: true, backAt: null } })
        )
      ).code
    ).toBe('FORBIDDEN')
    expect(
      (
        await refusal(
          admin.appConfig.set({
            key: KEY,
            value: { on: true, backAt: '23:30' }
          })
        )
      ).code
    ).toBe('BAD_REQUEST')
    expect(await status()).toEqual({ on: false, backAt: null })
  }
)
