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
  'completePub publica o bar com o teste de 90 dias do Elite (e o horário e a oferta), sem ler a chave antiga',
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
          address: `Rua do Teste ${id.slice(0, 8)}, 10`,
          // WEB-448: horário e oferta da Revisão gravam junto.
          openingHours: [
            { opens: '12:00', closes: '22:00' },
            null,
            null,
            null,
            null,
            { opens: '17:00', closes: '02:00' },
            { opens: '17:00', closes: '02:00' }
          ],
          houseOffer: '  Chopp em dobro   até o intervalo '
        })

      const [gravado] = await db
        .select({ openingHours: bar.openingHours, houseOffer: bar.houseOffer })
        .from(bar)
        .where(eq(bar.userId, id))
      expect(gravado).toEqual({
        openingHours: [
          { opens: '12:00', closes: '22:00' },
          null,
          null,
          null,
          null,
          { opens: '17:00', closes: '02:00' },
          { opens: '17:00', closes: '02:00' }
        ],
        houseOffer: 'Chopp em dobro até o intervalo'
      })

      // O vencimento é conferido contra o relógio do banco, que o gravou.
      const { rows } = await db.execute(sql`
        SELECT b.is_active, b.plan AS bar_plan, s.plan, s.status,
               s.external_subscription_id,
               s.current_period_end BETWEEN now() + interval '90 days' - interval '5 minutes'
                                        AND now() + interval '90 days' AS vence_em_90_dias
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
          vence_em_90_dias: true
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

/** Geocoding de mentira para um `completePub`; a chave some do `.env.test`. */
async function withFakeGeocoding<T>(run: () => Promise<T>): Promise<T> {
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
    return await run()
  } finally {
    fetchSpy.mockRestore()
    chave.LOCATIONIQ_API_KEY = anterior
  }
}

/**
 * Cadastro novo: o teste nasce no plano que a rotina recomenda, a rotina fica
 * no bar e o plano conta como não escolhido até o passo "Plano do teste", que
 * é o `changeTrialPlan` e não mexe no fim do teste.
 */
integrationTest(
  'completePub com a rotina: teste no plano recomendado, rotina no bar e plano a escolher; a escolha não muda o fim',
  async () => {
    const { db, appRouter } = await load()
    const id = crypto.randomUUID()
    await db.insert(user).values({
      id,
      name: 'Dono da rotina',
      email: `${id}@integration.invalid`,
      emailVerified: true,
      role: 'pub',
      onboardingCompleted: false
    })
    const caller = appRouter.createCaller(
      contextFor(id, 'pub', new Date(), { onboardingCompleted: false })
    )
    const read = async () => {
      const { rows } = await db.execute<{
        plan: string
        routine: unknown
        escolhido: boolean
        fim: string
      }>(sql`
        SELECT s.plan, b.routine, b.trial_plan_chosen_at IS NOT NULL AS escolhido,
               s.current_period_end::text AS fim
        FROM bar b JOIN subscription s ON s.bar_id = b.id
        WHERE b.user_id = ${id}
      `)
      return rows[0]
    }
    try {
      await withFakeGeocoding(() =>
        caller.onboarding.completePub({
          name: 'Bar da rotina',
          neighborhood: 'Centro',
          city: 'São Paulo',
          address: `Rua da Rotina ${id.slice(0, 8)}, 10`,
          routine: { games: 12, spend: 80, wants: ['cardapio', 'cardapio'] }
        })
      )
      const nasceu = await read()
      expect(nasceu).toMatchObject({
        plan: 'pro',
        routine: { games: 12, spend: 80, wants: ['cardapio'] },
        escolhido: false
      })

      const dono = appRouter.createCaller(contextFor(id, 'pub', new Date()))
      expect(await dono.pub.changeTrialPlan({ plan: 'starter' })).toEqual({
        plan: 'starter'
      })
      // O fim do teste não muda com a escolha.
      expect(await read()).toMatchObject({
        plan: 'starter',
        escolhido: true,
        fim: String(nasceu?.fim)
      })
      expect(await dono.pub.getMe()).toMatchObject({
        trialPlanChosenAt: expect.any(Date)
      })
    } finally {
      await db.delete(user).where(eq(user.id, id))
    }
  }
)

integrationTest(
  'completePub sem a rotina (cliente anterior): Elite e plano dado como escolhido',
  async () => {
    const { db, appRouter } = await load()
    const id = crypto.randomUUID()
    await db.insert(user).values({
      id,
      name: 'Dono antigo',
      email: `${id}@integration.invalid`,
      emailVerified: true,
      role: 'pub',
      onboardingCompleted: false
    })
    try {
      await withFakeGeocoding(() =>
        appRouter
          .createCaller(
            contextFor(id, 'pub', new Date(), { onboardingCompleted: false })
          )
          .onboarding.completePub({
            name: 'Bar sem rotina',
            neighborhood: 'Centro',
            city: 'São Paulo',
            address: `Rua Antiga ${id.slice(0, 8)}, 10`
          })
      )
      const { rows } = await db.execute(sql`
        SELECT s.plan, b.routine, b.trial_plan_chosen_at IS NOT NULL AS escolhido
        FROM bar b JOIN subscription s ON s.bar_id = b.id
        WHERE b.user_id = ${id}
      `)
      expect(rows).toEqual([{ plan: 'elite', routine: null, escolhido: true }])
    } finally {
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

integrationTest(
  'completeFan sem nada (o "Depois" da conta nova) conclui com o raio padrão',
  async () => {
    const { db, appRouter } = await load()
    const id = crypto.randomUUID()
    await db.insert(user).values({
      id,
      name: 'Conta nova por uma ação',
      email: `${id}@integration.invalid`,
      emailVerified: true,
      role: 'fan',
      onboardingCompleted: false
    })
    try {
      await appRouter
        .createCaller(
          contextFor(id, 'fan', new Date(), { onboardingCompleted: false })
        )
        .onboarding.completeFan({})
      const { rows } = await db.execute(sql`
        SELECT u.onboarding_completed AS feito, u.search_radius_km AS raio,
               (SELECT count(*)::int FROM user_preference_sports p
                 WHERE p.user_id = u.id) AS esportes
        FROM "user" u WHERE u.id = ${id}
      `)
      expect(rows).toEqual([{ feito: true, raio: 3, esportes: 0 }])
    } finally {
      await db.delete(user).where(eq(user.id, id))
    }
  }
)

/**
 * Um teste do cadastro por e-mail (relatório de vulnerabilidades, 20/11/2026):
 * excluir a conta e cadastrar de novo, com o e-mail escrito de outro jeito,
 * dá um bar sem assinatura e fora do ar. O Houdini libera o teste.
 */
integrationTest(
  'completePub com e-mail que já ganhou o teste: sem teste, aviso de endereço, e o Houdini libera',
  async () => {
    const { db, appRouter } = await load()
    const { trialGrant } = await import(
      '@findsports_oficial/db/schema/platform'
    )
    const { trialEmailHash } = await import('../lib/trial-grant')
    const local = `dono${crypto.randomUUID().slice(0, 8)}`
    const address = `Rua da Repetição ${local}, 10`
    const signup = async (email: string) => {
      const id = crypto.randomUUID()
      await db.insert(user).values({
        id,
        name: 'Dono repetido',
        email,
        emailVerified: true,
        role: 'pub',
        onboardingCompleted: false
      })
      const base = contextFor(id, 'pub', new Date(), {
        onboardingCompleted: false
      })
      const caller = appRouter.createCaller({
        ...base,
        session: { ...base.session, user: { ...base.session.user, email } }
      })
      const result = await withFakeGeocoding(() =>
        caller.onboarding.completePub({
          name: 'Bar repetido',
          neighborhood: 'Centro',
          city: 'São Paulo',
          address,
          houseOffer: 'Chopp em dobro'
        })
      )
      const [row] = await db
        .select({ id: bar.id, isActive: bar.isActive, offer: bar.houseOffer })
        .from(bar)
        .where(eq(bar.userId, id))
      return { id, caller, result, bar: row }
    }
    const hash = trialEmailHash(`${local}@gmail.com`)
    let second: Awaited<ReturnType<typeof signup>> | undefined
    try {
      const first = await signup(`${local}@gmail.com`)
      expect(first.result).toEqual({ success: true, trial: true })
      expect(first.bar?.isActive).toBe(true)
      // Excluir a conta leva o bar, mas não a linha do teste.
      await db.delete(user).where(eq(user.id, first.id))

      second = await signup(
        `${local.slice(0, 2)}.${local.slice(2)}+novo@googlemail.com`
      )
      expect(second.result).toEqual({ success: true, trial: false })
      expect(second.bar).toMatchObject({ isActive: false, offer: null })
      expect(await second.caller.onboarding.trialAvailable()).toEqual({
        trial: false
      })
      const barId = second.bar?.id ?? ''
      const { rows } = await db.execute(
        sql`SELECT 1 FROM subscription WHERE bar_id = ${barId}`
      )
      expect(rows).toEqual([])

      const admin = appRouter.createCaller(
        contextFor(crypto.randomUUID(), 'admin')
      )
      expect(await admin.adminBars.ficha({ barId })).toMatchObject({
        deniedTrial: true,
        sameAddress: true
      })

      const started = await admin.adminBars.startTrial({ barId })
      expect(started.isActive).toBe(true)
      const { rows: sub } = await db.execute(sql`
        SELECT s.status, s.plan, b.is_active,
               s.current_period_end BETWEEN now() + interval '90 days' - interval '5 minutes'
                                        AND now() + interval '90 days' AS vence_em_90_dias
        FROM subscription s JOIN bar b ON b.id = s.bar_id
        WHERE s.bar_id = ${barId}
      `)
      expect(sub).toEqual([
        {
          status: 'trialing',
          plan: 'elite',
          is_active: true,
          vence_em_90_dias: true
        }
      ])
      expect(await admin.adminBars.ficha({ barId })).toMatchObject({
        deniedTrial: false
      })
      // De novo: já tem teste, recusa sem escrever.
      await expect(admin.adminBars.startTrial({ barId })).rejects.toMatchObject(
        { code: 'PRECONDITION_FAILED' }
      )
      const { rows: grimorio } = await db.execute(
        sql`SELECT kind FROM admin_action WHERE target_id = ${barId}`
      )
      expect(grimorio).toEqual([{ kind: 'bar.start_trial' }])
    } finally {
      if (second) await db.delete(user).where(eq(user.id, second.id))
      await db.delete(trialGrant).where(eq(trialGrant.emailHash, hash))
    }
  }
)
