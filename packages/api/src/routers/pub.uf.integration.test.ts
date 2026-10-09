import { expect, spyOn, test } from 'bun:test'
import { eq } from '@findsports_oficial/db'
import { user } from '@findsports_oficial/db/schema/auth'
import { bar } from '@findsports_oficial/db/schema/platform'
import { isDisposableTestDatabase } from '@findsports_oficial/db/utils/db-resolver'
import { env } from '@findsports_oficial/env/server'
import { contextFor, inAMonth, load, seedBar } from './integration-seed'

/**
 * UF do bar (WEB-270): vai ao geocoding como estado e fica gravada. Ausente —
 * cliente antigo durante o deploy, bar anterior ao campo — nada muda.
 */

const integrationTest = isDisposableTestDatabase() ? test : test.skip

/** Rua única por teste: o cache do geocoding é do processo. */
const rua = () => `Rua UF ${crypto.randomUUID().slice(0, 8)}, 10`

/**
 * Geocoding de mentira: devolve a rua, a cidade e o estado pedidos, e guarda o
 * `state` de cada consulta. O resto da rede passa direto. A chave some do
 * `.env.test` de propósito, então entra aqui e sai no `restore`.
 */
function fakeGeocoding() {
  const real = globalThis.fetch
  const states: (string | null)[] = []
  const chave = env as { LOCATIONIQ_API_KEY?: string }
  const anterior = chave.LOCATIONIQ_API_KEY
  chave.LOCATIONIQ_API_KEY = 'chave-de-teste'
  const spy = spyOn(globalThis, 'fetch').mockImplementation(((
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1]
  ) => {
    const url = new URL(String(input instanceof Request ? input.url : input))
    if (!url.pathname.endsWith('/v1/search')) return real(input, init)
    const state = url.searchParams.get('state')
    states.push(state)
    return Promise.resolve(
      Response.json([
        {
          lat: '-5.98',
          lon: '-35.58',
          address: {
            road: url.searchParams.get('street'),
            city: url.searchParams.get('city'),
            ...(state && { state })
          }
        }
      ])
    )
  }) as typeof fetch)
  return {
    states,
    restore: () => {
      spy.mockRestore()
      chave.LOCATIONIQ_API_KEY = anterior
    }
  }
}

async function seedPending() {
  const { db, appRouter } = await load()
  const id = crypto.randomUUID()
  await db.insert(user).values({
    id,
    name: 'Dono de integração',
    email: `${id}@integration.invalid`,
    emailVerified: true,
    role: 'pub',
    onboardingCompleted: false
  })
  return {
    caller: appRouter.createCaller(
      contextFor(id, 'pub', new Date(), { onboardingCompleted: false })
    ),
    stored: async () =>
      (
        await db
          .select({ city: bar.city, uf: bar.uf })
          .from(bar)
          .where(eq(bar.userId, id))
      )[0],
    cleanup: () => db.delete(user).where(eq(user.id, id))
  }
}

const NOVO_BAR = {
  name: 'Bar da UF',
  neighborhood: 'Centro',
  city: 'Bom Jesus'
}

integrationTest(
  'completePub manda o estado ao geocoding e grava a UF',
  async () => {
    const ctx = await seedPending()
    const geo = fakeGeocoding()
    try {
      await ctx.caller.onboarding.completePub({
        ...NOVO_BAR,
        address: rua(),
        uf: 'RN'
      })
      expect(geo.states).toEqual(['Rio Grande do Norte'])
      expect(await ctx.stored()).toEqual({ city: 'Bom Jesus', uf: 'RN' })
    } finally {
      geo.restore()
      await ctx.cleanup()
    }
  }
)

integrationTest(
  'completePub sem UF (cliente antigo) cria o bar como antes; sigla inválida é recusada',
  async () => {
    const ctx = await seedPending()
    const geo = fakeGeocoding()
    try {
      await expect(
        ctx.caller.onboarding.completePub({
          ...NOVO_BAR,
          address: rua(),
          // @ts-expect-error sigla fora da lista: o zod recusa antes de tudo.
          uf: 'XX'
        })
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
      expect(geo.states).toEqual([])
      expect(await ctx.stored()).toBeUndefined()

      await ctx.caller.onboarding.completePub({ ...NOVO_BAR, address: rua() })
      expect(geo.states).toEqual([null])
      expect(await ctx.stored()).toEqual({ city: 'Bom Jesus', uf: null })
    } finally {
      geo.restore()
      await ctx.cleanup()
    }
  }
)

integrationTest(
  'updateMe: bar sem UF edita o resto sem geocoding; a UF nova geocodifica e grava',
  async () => {
    const ctx = await seedBar('starter', 'active', inAMonth(), {
      address: rua()
    })
    const geo = fakeGeocoding()
    const uf = async () =>
      (
        await ctx.db
          .select({ uf: bar.uf })
          .from(bar)
          .where(eq(bar.id, ctx.barId))
      )[0]?.uf
    try {
      await ctx.owner.pub.updateMe({ description: 'Chope gelado.' })
      expect(geo.states).toEqual([])
      expect(await uf()).toBeNull()

      await ctx.owner.pub.updateMe({ uf: 'SP' })
      expect(geo.states).toEqual(['São Paulo'])
      expect(await uf()).toBe('SP')

      // Reenviar a mesma UF, como o formulário faz, não consulta de novo; e
      // mudar só a rua leva a UF gravada.
      await ctx.owner.pub.updateMe({ uf: 'SP', description: 'Outra.' })
      expect(geo.states).toEqual(['São Paulo'])
      await ctx.owner.pub.updateMe({ address: rua() })
      expect(geo.states).toEqual(['São Paulo', 'São Paulo'])
    } finally {
      geo.restore()
      await ctx.cleanup()
    }
  }
)
