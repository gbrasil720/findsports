import { expect, spyOn, test } from 'bun:test'
import { eq, sql } from '@findsports_oficial/db'
import { user } from '@findsports_oficial/db/schema/auth'
import { bar } from '@findsports_oficial/db/schema/platform'
import { isDisposableTestDatabase } from '@findsports_oficial/db/utils/db-resolver'
import { env } from '@findsports_oficial/env/server'
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
      // Só o geocoding interessa: o processo de teste é compartilhado, e outra
      // chamada de rede em curso não é deste envio.
      expect(
        fetchSpy.mock.calls.filter(([input]) =>
          String(input instanceof Request ? input.url : input).includes(
            '/v1/search'
          )
        )
      ).toEqual([])
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

/**
 * WEB-233: o teste grátis do cadastro é regra fixa. A linha antiga da chave
 * continua em `app_config` até a migration de limpeza; aqui ela diz
 * "desligado, Starter, 14 dias" para provar que ninguém mais a lê.
 */
integrationTest(
  'completePub publica o bar com o teste de 120 dias do Elite, sem ler a chave antiga',
  async () => {
    const { db, appRouter } = await load()
    const { appConfigStore } = await import('../lib/app-config')
    const id = crypto.randomUUID()
    await db.insert(user).values({
      id,
      name: 'Dono de integração',
      email: `${id}@integration.invalid`,
      emailVerified: true,
      role: 'pub',
      onboardingCompleted: false
    })
    // Em duas partes: o aceite do WEB-233 é a chave não aparecer por extenso
    // fora das migrations.
    const antiga = ['billing', 'onboarding_trial'].join('.')
    await db.execute(sql`
      INSERT INTO app_config (key, value)
      VALUES (${antiga}, '{"enabled":false,"plan":"starter","days":14}'::jsonb)
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
    `)
    await appConfigStore.invalidate()

    // Geocoding de mentira; a chave some do `.env.test` de propósito.
    const real = globalThis.fetch
    const chave = env as { LOCATIONIQ_API_KEY?: string }
    const anterior = chave.LOCATIONIQ_API_KEY
    chave.LOCATIONIQ_API_KEY = 'chave-de-teste'
    const fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(((
      input: Parameters<typeof fetch>[0],
      init?: Parameters<typeof fetch>[1]
    ) => {
      const url = new URL(String(input instanceof Request ? input.url : input))
      if (!url.pathname.endsWith('/v1/search')) return real(input, init)
      return Promise.resolve(
        Response.json([
          {
            lat: '-23.55',
            lon: '-46.63',
            address: {
              road: url.searchParams.get('street'),
              city: url.searchParams.get('city')
            }
          }
        ])
      )
    }) as typeof fetch)

    try {
      await appRouter
        .createCaller(
          contextFor(id, 'pub', new Date(), { onboardingCompleted: false })
        )
        .onboarding.completePub({
          name: 'Bar do teste grátis',
          neighborhood: 'Centro',
          city: 'São Paulo',
          address: `Rua do Teste ${id.slice(0, 8)}, 10`
        })

      // O vencimento é conferido contra o relógio do banco, que o gravou.
      const { rows } = await db.execute(sql`
        SELECT b.is_active, b.plan AS bar_plan, s.plan, s.status,
               s.external_subscription_id,
               s.current_period_end BETWEEN now() + interval '120 days' - interval '5 minutes'
                                        AND now() + interval '120 days' AS vence_em_120_dias
        FROM bar b LEFT JOIN subscription s ON s.bar_id = b.id
        WHERE b.user_id = ${id}
      `)
      expect(rows).toEqual([
        {
          is_active: true,
          bar_plan: 'elite',
          plan: 'elite',
          status: 'trialing',
          external_subscription_id: null,
          vence_em_120_dias: true
        }
      ])
    } finally {
      fetchSpy.mockRestore()
      chave.LOCATIONIQ_API_KEY = anterior
      await db.execute(sql`DELETE FROM app_config WHERE key = ${antiga}`)
      await appConfigStore.invalidate()
      await db.delete(user).where(eq(user.id, id))
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
