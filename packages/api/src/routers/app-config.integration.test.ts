import { expect, test } from 'bun:test'
import { eq, sql } from '@findsports_oficial/db'
import { user } from '@findsports_oficial/db/schema/auth'
import { isDisposableTestDatabase } from '@findsports_oficial/db/utils/db-resolver'
import { contextFor, load, refusal } from './integration-seed'

/**
 * Painel /internal/flags (WEB-346): o `list` diz quem alterou pelo nome, e o
 * `set` recusado devolve o campo e o limite, que é o que a tela mostra.
 */

const integrationTest = isDisposableTestDatabase() ? test : test.skip

const KEY = 'rating.public_display'
const LISTA = 'launch.pub_cities'

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

      await caller.appConfig.set({ key: KEY, value: true })
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
        caller.appConfig.set({ key: LISTA, value: ['x'.repeat(101)] })
      )
    ).toEqual({
      code: 'BAD_REQUEST',
      message:
        '0: Grande demais: esperava que o texto tivesse <= 100 caracteres'
    })
    expect(
      await refusal(caller.appConfig.set({ key: LISTA, value: 'Recife' }))
    ).toEqual({
      code: 'BAD_REQUEST',
      message: 'Entrada inválida: esperava um vetor, recebeu um texto'
    })

    const entrada = (await caller.appConfig.list()).find((e) => e.key === LISTA)
    expect(entrada?.sobrescrito).toBe(false)
  }
)

/**
 * WEB-233: as três chaves de cobrança saíram do registro, mas as linhas delas
 * continuam gravadas em produção até a migration de limpeza. Não podem chegar
 * ao painel nem à leitura pública, e não derrubam nenhuma das duas.
 */
integrationTest(
  'linha de chave aposentada fica no banco e some da leitura',
  async () => {
    const { db, appRouter } = await load()
    const { appConfigStore, PUBLIC_APP_CONFIG_KEYS } = await import(
      '../lib/app-config'
    )
    // Os valores que produção tem gravados.
    const orfas = {
      checkout_enabled: true,
      onboarding_trial: { enabled: true, plan: 'elite', days: 120 },
      founder_coupon: { enabled: true, couponId: 'eM7dQpMF' }
    }
    const chaves = Object.keys(orfas).map((nome) => `billing.${nome}`)
    for (const [nome, valor] of Object.entries(orfas)) {
      await db.execute(sql`
        INSERT INTO app_config (key, value)
        VALUES (${`billing.${nome}`}, ${JSON.stringify(valor)}::jsonb)
        ON CONFLICT (key) DO NOTHING
      `)
    }
    await appConfigStore.invalidate()
    const caller = appRouter.createCaller(
      contextFor(crypto.randomUUID(), 'admin')
    )

    try {
      const gravadas = await db.execute(
        sql`SELECT key FROM app_config WHERE key LIKE 'billing.%' ORDER BY key`
      )
      expect(gravadas.rows.map((linha) => linha.key)).toEqual(chaves.sort())

      const listadas = (await caller.appConfig.list()).map((e) => e.key)
      expect(listadas.filter((key) => key.startsWith('billing.'))).toEqual([])
      expect(Object.keys(await caller.appConfig.getPublic()).sort()).toEqual(
        [...PUBLIC_APP_CONFIG_KEYS].sort()
      )
    } finally {
      await db.execute(sql`DELETE FROM app_config WHERE key LIKE 'billing.%'`)
      await appConfigStore.invalidate()
    }
  }
)
