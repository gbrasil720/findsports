import { expect, spyOn } from 'bun:test'
import { eq, inArray } from '@findsports_oficial/db'
import { user } from '@findsports_oficial/db/schema/auth'
import {
  bar,
  event,
  sport,
  subscription
} from '@findsports_oficial/db/schema/platform'
import { env } from '@findsports_oficial/env/server'
import { TRPCError } from '@trpc/server'
import type { AppRouter } from './index'

/**
 * Seed compartilhado dos testes de integração da API: contexto de sessão
 * fabricado e um bar ativo com dono, torcedor e assinatura. Só roda contra o
 * banco descartável — os arquivos `*.integration.test.ts` decidem isso.
 */

export type Role = 'pub' | 'fan' | 'admin'
export type Plan = 'starter' | 'pro' | 'elite'
export type Status = 'trialing' | 'active' | 'past_due'
type Caller = ReturnType<AppRouter['createCaller']>

export function contextFor(
  userId: string,
  role: Role,
  now = new Date(),
  { onboardingCompleted = true } = {}
) {
  return {
    auth: null,
    clientIp: '127.0.0.1',
    session: {
      session: {
        id: crypto.randomUUID(),
        token: crypto.randomUUID(),
        userId,
        createdAt: now,
        updatedAt: now,
        expiresAt: new Date(now.getTime() + 3_600_000),
        ipAddress: null,
        userAgent: null
      },
      user: {
        id: userId,
        name: `Conta ${role}`,
        email: `${userId}@integration.invalid`,
        emailVerified: true,
        image: null,
        role,
        banned: false,
        onboardingCompleted,
        searchRadiusKm: 3,
        twoFactorEnabled: role === 'admin',
        createdAt: now,
        updatedAt: now
      }
    }
  }
}

// Import dinâmico: o banco só é resolvido quando um teste de integração roda.
export async function load() {
  const [{ db }, { appRouter }] = await Promise.all([
    import('@findsports_oficial/db'),
    import('./index')
  ])
  return { db, appRouter }
}

export const inAMonth = () => new Date(Date.now() + 30 * 24 * 3_600_000)

/** Cria dono + bar ativo + assinatura e devolve o que o teste precisa limpar. */
export async function seedBar(
  plan: Plan,
  status: Status,
  currentPeriodEnd: Date | null,
  barFields: Partial<typeof bar.$inferInsert> = {}
): Promise<{
  db: Awaited<ReturnType<typeof load>>['db']
  barId: string
  owner: Caller
  ownerId: string
  fan: Caller
  fanId: string
  /**
   * Jogo do bar daqui a um mês, marcado para receber reservas salvo se
   * `fields` disser outra coisa. O esporte sai no `cleanup`.
   */
  seedGame: (fields?: Partial<typeof event.$inferInsert>) => Promise<string>
  cleanup: () => Promise<void>
}> {
  const { db, appRouter } = await load()
  const ownerId = crypto.randomUUID()
  const fanId = crypto.randomUUID()
  const barId = crypto.randomUUID()
  const sportIds: string[] = []

  await db.insert(user).values([
    {
      id: ownerId,
      name: 'Dono de integração',
      email: `${ownerId}@integration.invalid`,
      emailVerified: true,
      role: 'pub',
      onboardingCompleted: true
    },
    {
      id: fanId,
      name: 'Torcedor de integração',
      email: `${fanId}@integration.invalid`,
      emailVerified: true,
      role: 'fan',
      onboardingCompleted: true
    }
  ])
  await db.insert(bar).values({
    id: barId,
    userId: ownerId,
    name: 'Bar de integração',
    address: 'Rua descartável, 1',
    neighborhood: 'Teste',
    city: 'Teste',
    latitude: '-23.55052000',
    longitude: '-46.63330800',
    isActive: true,
    ...barFields
  })
  await db
    .insert(subscription)
    .values({ barId, plan, status, currentPeriodEnd })

  return {
    db,
    barId,
    owner: appRouter.createCaller(contextFor(ownerId, 'pub')),
    ownerId,
    fan: appRouter.createCaller(contextFor(fanId, 'fan')),
    fanId,
    seedGame: async (fields = {}) => {
      const sportId = crypto.randomUUID()
      sportIds.push(sportId)
      await db.insert(sport).values({
        id: sportId,
        name: `Esporte ${sportId}`,
        slug: `integration-${sportId}`
      })
      const [game] = await db
        .insert(event)
        .values({
          barId,
          sportId,
          championship: 'Campeonato de integração',
          startsAt: inAMonth(),
          acceptsReservations: true,
          ...fields
        })
        .returning({ id: event.id })
      if (!game) throw new Error('jogo não criado')
      return game.id
    },
    cleanup: async () => {
      await db.delete(user).where(eq(user.id, ownerId))
      await db.delete(user).where(eq(user.id, fanId))
      // Depois do dono: o bar e os jogos saem em cascata, e o esporte fica livre.
      if (sportIds.length) {
        await db.delete(sport).where(inArray(sport.id, sportIds))
      }
    }
  }
}

export async function storedOffer(barId: string) {
  const { db } = await load()
  const [row] = await db
    .select({ houseOffer: bar.houseOffer })
    .from(bar)
    .where(eq(bar.id, barId))
  return row?.houseOffer ?? null
}

/** Espera a recusa da API e devolve o código e a mensagem do `TRPCError`. */
export async function refusal(promise: Promise<unknown>) {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e
  )
  expect(error).toBeInstanceOf(TRPCError)
  const { code, message } = error as TRPCError
  return { code, message }
}

/**
 * Roda `fn` com o banco numa sessão no fuso `session` (o Postgres converte
 * `timestamp` × `timestamptz` por ele) e, se dado, o processo no fuso
 * `process` (o driver escreve um `Date` cru nele). Produção é UTC nos dois;
 * os testes do relógio do jogo provam que nenhum dos dois muda a resposta.
 */
export async function withClock<T>(
  zones: { session: string; process?: string },
  fn: () => Promise<T>
): Promise<T> {
  const [{ runWithDb }, { resolveAndValidateDatabaseUrl }] = await Promise.all([
    import('@findsports_oficial/db'),
    import('@findsports_oficial/db/utils/db-resolver')
  ])
  const url = new URL(resolveAndValidateDatabaseUrl().url)
  url.searchParams.set('options', `-c TimeZone=${zones.session}`)
  const previous = process.env.TZ
  if (zones.process) process.env.TZ = zones.process
  try {
    return await runWithDb(url.toString(), fn)
  } finally {
    if (previous === undefined) delete process.env.TZ
    else process.env.TZ = previous
  }
}

export type ResendBody = {
  to: string[]
  reply_to: string
  subject: string
  text: string
  attachments?: { filename: string; content_type: string; content: string }[]
}

/**
 * A Resend como dublê: guarda o corpo de cada envio. As chaves somem do
 * `.env.test` de propósito, então entram aqui e saem no fim do teste.
 */
export function fakeResend(cleanups: (() => unknown)[], status = 200) {
  const real = globalThis.fetch
  const sent: ResendBody[] = []
  const keys = env as { RESEND_API_KEY?: string; RESEND_FROM_EMAIL?: string }
  keys.RESEND_API_KEY = 're_teste'
  keys.RESEND_FROM_EMAIL = 'nao-responda@mail.onside.sh'
  const spy = spyOn(globalThis, 'fetch').mockImplementation(((
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1]
  ) => {
    const url = String(input instanceof Request ? input.url : input)
    if (url !== 'https://api.resend.com/emails') return real(input, init)
    sent.push(JSON.parse(String(init?.body)))
    return Promise.resolve(new Response('{}', { status }))
  }) as typeof fetch)
  cleanups.push(() => {
    spy.mockRestore()
    keys.RESEND_API_KEY = undefined
    keys.RESEND_FROM_EMAIL = undefined
  })
  return sent
}
