import { expect, test } from 'bun:test'
import { eq, inArray } from '@findsports_oficial/db'
import { isReservationCodeComplete } from '@findsports_oficial/db/reservation-code'
import { user } from '@findsports_oficial/db/schema/auth'
import {
  bar,
  event,
  sport,
  subscription
} from '@findsports_oficial/db/schema/platform'
import { reservationCode } from '@findsports_oficial/db/schema/reservation'
import { isDisposableTestDatabase } from '@findsports_oficial/db/utils/db-resolver'
import { TRPCError } from '@trpc/server'

/**
 * Pedido de reserva do torcedor (WEB-124) contra o banco de verdade. Cada
 * teste é um critério de aceite do ticket: duplicidade, posse e aposentadoria
 * do código só se provam com os índices e as triggers reais.
 */

const integrationTest = isDisposableTestDatabase() ? test : test.skip

type Role = 'pub' | 'fan'

const HOUR = 3_600_000

function contextFor(userId: string, role: Role, now = new Date()) {
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
        expiresAt: new Date(now.getTime() + HOUR),
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
        onboardingCompleted: true,
        searchRadiusKm: 3,
        twoFactorEnabled: false,
        createdAt: now,
        updatedAt: now
      }
    }
  }
}

async function seed(options: { acceptsReservations?: boolean } = {}) {
  const [{ db }, { appRouter }] = await Promise.all([
    import('@findsports_oficial/db'),
    import('./index')
  ])
  const ownerId = crypto.randomUUID()
  const fanId = crypto.randomUUID()
  const otherFanId = crypto.randomUUID()
  const barId = crypto.randomUUID()
  const sportId = crypto.randomUUID()

  await db.insert(user).values(
    [
      { id: ownerId, role: 'pub' as const },
      { id: fanId, role: 'fan' as const },
      { id: otherFanId, role: 'fan' as const }
    ].map((account) => ({
      ...account,
      name: `Conta ${account.role}`,
      email: `${account.id}@integration.invalid`,
      emailVerified: true,
      onboardingCompleted: true
    }))
  )
  await db.insert(bar).values({
    id: barId,
    userId: ownerId,
    name: 'Bar da reserva',
    address: 'Rua descartável, 1',
    neighborhood: 'Teste',
    city: 'Teste',
    latitude: '-23.55052000',
    longitude: '-46.63330800',
    isActive: true,
    houseOffer: 'Chopp em dobro',
    acceptsReservations: options.acceptsReservations ?? true
  })
  await db.insert(subscription).values({
    barId,
    plan: 'elite',
    status: 'active',
    currentPeriodEnd: new Date(Date.now() + 30 * 24 * HOUR)
  })
  await db.insert(sport).values({
    id: sportId,
    name: `Esporte ${sportId}`,
    slug: `integration-${sportId}`
  })
  const [future, past] = await db
    .insert(event)
    .values(
      [24 * HOUR, -HOUR].map((offset) => ({
        barId,
        sportId,
        championship: 'Campeonato de integração',
        participantFreeText: 'Time A × Time B',
        startsAt: new Date(Date.now() + offset)
      }))
    )
    .returning({ id: event.id })
  if (!future || !past) throw new Error('eventos não criados')

  const api = (userId: string, role: Role) =>
    appRouter.createCaller(contextFor(userId, role)).reservations

  return {
    db,
    barId,
    futureId: future.id,
    pastId: past.id,
    fan: api(fanId, 'fan'),
    otherFan: api(otherFanId, 'fan'),
    owner: api(ownerId, 'pub'),
    request: (eventId = future.id) => ({
      requestId: crypto.randomUUID(),
      eventId,
      partySize: 3,
      note: '  Mesa perto da TV  '
    }),
    cleanup: async () => {
      await db
        .delete(user)
        .where(inArray(user.id, [ownerId, fanId, otherFanId]))
      await db.delete(sport).where(eq(sport.id, sportId))
    }
  }
}

async function refusal(promise: Promise<unknown>) {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e
  )
  expect(error).toBeInstanceOf(TRPCError)
  const { code, message } = error as TRPCError
  return { code, message }
}

integrationTest(
  'torcedor pede, recebe código com janela e oferta congelada',
  async () => {
    const ctx = await seed()
    try {
      const created = await ctx.fan.create(ctx.request())

      expect(created).toMatchObject({
        status: 'pending',
        partySize: 3,
        note: 'Mesa perto da TV',
        offerSnapshot: 'Chopp em dobro',
        bar: { id: ctx.barId, name: 'Bar da reserva' },
        canCancel: true
      })
      expect(isReservationCodeComplete(created.code ?? '')).toBe(true)
      expect(created.window?.opensAt.getTime()).toBeLessThan(
        created.event.startsAt.getTime()
      )

      // A oferta mudou depois: a reserva continua com a que foi aceita.
      await ctx.db
        .update(bar)
        .set({ houseOffer: 'Nada' })
        .where(eq(bar.id, ctx.barId))
      const [mine] = await ctx.fan.mine()
      expect(mine?.offerSnapshot).toBe('Chopp em dobro')
    } finally {
      await ctx.cleanup()
    }
  }
)

integrationTest('reenvio do mesmo pedido não duplica', async () => {
  const ctx = await seed()
  try {
    const input = ctx.request()
    const [first, second] = await Promise.all([
      ctx.fan.create(input),
      ctx.fan.create(input)
    ])
    const third = await ctx.fan.create(input)

    expect(second.id).toBe(first.id)
    expect(third.code).toBe(first.code)
    expect(await ctx.fan.mine()).toHaveLength(1)
  } finally {
    await ctx.cleanup()
  }
})

integrationTest(
  'segundo pedido ativo para o mesmo jogo recebe mensagem clara',
  async () => {
    const ctx = await seed()
    try {
      await ctx.fan.create(ctx.request())
      expect(await refusal(ctx.fan.create(ctx.request()))).toEqual({
        code: 'CONFLICT',
        message:
          'Você já tem um pedido ativo para este jogo. Acompanhe em Minhas reservas.'
      })
    } finally {
      await ctx.cleanup()
    }
  }
)

integrationTest(
  'jogo passado, papel errado e bar sem recebimento falham no servidor',
  async () => {
    const ctx = await seed({ acceptsReservations: false })
    try {
      expect(
        (await refusal(ctx.fan.create(ctx.request(ctx.pastId)))).code
      ).toBe('PRECONDITION_FAILED')
      expect((await refusal(ctx.owner.create(ctx.request()))).code).toBe(
        'FORBIDDEN'
      )
      expect(await refusal(ctx.fan.create(ctx.request()))).toEqual({
        code: 'PRECONDITION_FAILED',
        message: 'Este bar não está recebendo reservas pela Onside no momento.'
      })

      await ctx.db
        .update(bar)
        .set({ acceptsReservations: true })
        .where(eq(bar.id, ctx.barId))
      await ctx.db
        .update(subscription)
        .set({ status: 'past_due' })
        .where(eq(subscription.barId, ctx.barId))
      expect((await refusal(ctx.fan.create(ctx.request()))).code).toBe(
        'PRECONDITION_FAILED'
      )
    } finally {
      await ctx.cleanup()
    }
  }
)

integrationTest(
  'outro torcedor não lê nem cancela reserva alheia',
  async () => {
    const ctx = await seed()
    try {
      const created = await ctx.fan.create(ctx.request())

      expect(await ctx.otherFan.mine()).toEqual([])
      expect(
        (await refusal(ctx.otherFan.cancel({ reservationId: created.id }))).code
      ).toBe('NOT_FOUND')
      const [mine] = await ctx.fan.mine()
      expect(mine?.status).toBe('pending')
    } finally {
      await ctx.cleanup()
    }
  }
)

integrationTest(
  'perda do plano não impede ler nem cancelar; cancelar aposenta o código',
  async () => {
    const ctx = await seed()
    try {
      const created = await ctx.fan.create(ctx.request())
      await ctx.db
        .update(subscription)
        .set({ status: 'cancelled' })
        .where(eq(subscription.barId, ctx.barId))
      await ctx.db
        .update(bar)
        .set({ acceptsReservations: false })
        .where(eq(bar.id, ctx.barId))

      expect(await ctx.fan.mine()).toHaveLength(1)
      const cancelled = await ctx.fan.cancel({ reservationId: created.id })
      expect(cancelled).toMatchObject({
        status: 'cancelled',
        code: null,
        canCancel: false
      })
      // Repetir não falha.
      await ctx.fan.cancel({ reservationId: created.id })

      const codes = await ctx.db
        .select({ retiredAt: reservationCode.retiredAt })
        .from(reservationCode)
        .where(eq(reservationCode.reservationId, created.id))
      expect(codes).toHaveLength(1)
      expect(codes[0]?.retiredAt).not.toBeNull()
    } finally {
      await ctx.cleanup()
    }
  }
)

integrationTest('cancelado, o torcedor pode pedir de novo', async () => {
  const ctx = await seed()
  try {
    const first = await ctx.fan.create(ctx.request())
    await ctx.fan.cancel({ reservationId: first.id })
    const again = await ctx.fan.create(ctx.request())
    expect(again.status).toBe('pending')
    expect(again.code).not.toBe(first.code)
  } finally {
    await ctx.cleanup()
  }
})
