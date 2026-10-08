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
import { contextFor, load, type Role, refusal } from './integration-seed'

/**
 * Pedido de reserva do torcedor (WEB-124) contra o banco de verdade. Cada
 * teste é um critério de aceite do ticket: duplicidade, posse e aposentadoria
 * do código só se provam com os índices e as triggers reais.
 */

const integrationTest = isDisposableTestDatabase() ? test : test.skip

const HOUR = 3_600_000

async function seed(options: { acceptsReservations?: boolean } = {}) {
  const { db, appRouter } = await load()
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
  const queue = (userId: string) =>
    appRouter.createCaller(contextFor(userId, 'pub')).barReservations

  return {
    db,
    barId,
    futureId: future.id,
    pastId: past.id,
    fan: api(fanId, 'fan'),
    otherFan: api(otherFanId, 'fan'),
    owner: api(ownerId, 'pub'),
    queue: queue(ownerId),
    queueOf: queue,
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

/* Fila do bar (WEB-125) */

integrationTest(
  'dono lista pendentes primeiro, sem contato do torcedor, e confirma uma vez',
  async () => {
    const ctx = await seed()
    try {
      const first = await ctx.fan.create(ctx.request())
      const second = await ctx.otherFan.create(ctx.request())
      await ctx.queue.respond({ reservationId: first.id, status: 'confirmed' })

      const list = await ctx.queue.list()
      expect(list.map(({ id, status }) => ({ id, status }))).toEqual([
        { id: second.id, status: 'pending' },
        { id: first.id, status: 'confirmed' }
      ])
      expect(list[0]).toMatchObject({
        guestName: 'Conta fan',
        partySize: 3,
        note: 'Mesa perto da TV',
        offerSnapshot: 'Chopp em dobro',
        event: { participantFreeText: 'Time A × Time B' }
      })
      expect(JSON.stringify(list)).not.toContain('@integration.invalid')

      const [mine] = await ctx.fan.mine()
      expect(mine).toMatchObject({ status: 'confirmed', code: first.code })

      expect(
        await ctx.queue.respond({
          reservationId: first.id,
          status: 'confirmed'
        })
      ).toMatchObject({ status: 'confirmed', changed: false })
    } finally {
      await ctx.cleanup()
    }
  }
)

integrationTest(
  'duas confirmações simultâneas fazem uma transição',
  async () => {
    const ctx = await seed()
    try {
      const created = await ctx.fan.create(ctx.request())
      const input = { reservationId: created.id, status: 'confirmed' as const }
      const results = await Promise.all([
        ctx.queue.respond(input),
        ctx.queue.respond(input)
      ])
      expect(results.map((r) => r.changed).sort()).toEqual([false, true])
    } finally {
      await ctx.cleanup()
    }
  }
)

integrationTest(
  'recusar aposenta o código; responder de novo ou pedido cancelado falha',
  async () => {
    const ctx = await seed()
    try {
      const declined = await ctx.fan.create(ctx.request())
      await ctx.queue.respond({
        reservationId: declined.id,
        status: 'declined'
      })
      const [mine] = await ctx.fan.mine()
      expect(mine).toMatchObject({ status: 'declined', code: null })
      expect(
        await refusal(
          ctx.queue.respond({ reservationId: declined.id, status: 'confirmed' })
        )
      ).toEqual({ code: 'CONFLICT', message: 'Este pedido já foi recusado.' })

      const cancelled = await ctx.otherFan.create(ctx.request())
      await ctx.otherFan.cancel({ reservationId: cancelled.id })
      expect(
        await refusal(
          ctx.queue.respond({
            reservationId: cancelled.id,
            status: 'confirmed'
          })
        )
      ).toEqual({
        code: 'PRECONDITION_FAILED',
        message: 'O torcedor cancelou este pedido.'
      })
    } finally {
      await ctx.cleanup()
    }
  }
)

integrationTest(
  'dono de outro bar não lê nem responde; sem Elite ninguém responde',
  async () => {
    const ctx = await seed()
    const intruderId = crypto.randomUUID()
    try {
      const created = await ctx.fan.create(ctx.request())

      await ctx.db.insert(user).values({
        id: intruderId,
        role: 'pub',
        name: 'Outro bar',
        email: `${intruderId}@integration.invalid`,
        emailVerified: true,
        onboardingCompleted: true
      })
      const [intruderBar] = await ctx.db
        .insert(bar)
        .values({
          userId: intruderId,
          name: 'Outro bar',
          address: 'Rua descartável, 2',
          neighborhood: 'Teste',
          city: 'Teste',
          latitude: '-23.55052000',
          longitude: '-46.63330800',
          isActive: true
        })
        .returning({ id: bar.id })
      if (!intruderBar) throw new Error('bar não criado')
      await ctx.db.insert(subscription).values({
        barId: intruderBar.id,
        plan: 'elite',
        status: 'active',
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * HOUR)
      })
      const intruder = ctx.queueOf(intruderId)

      expect(await intruder.list()).toEqual([])
      expect(
        (
          await refusal(
            intruder.setGameCap({ eventId: ctx.futureId, reservationCap: 1 })
          )
        ).code
      ).toBe('NOT_FOUND')
      expect(
        (
          await refusal(
            intruder.respond({ reservationId: created.id, status: 'declined' })
          )
        ).code
      ).toBe('NOT_FOUND')

      await ctx.db
        .update(subscription)
        .set({ status: 'past_due' })
        .where(eq(subscription.barId, ctx.barId))
      expect((await refusal(ctx.queue.list())).code).toBe('FORBIDDEN')
      expect(
        (
          await refusal(
            ctx.queue.respond({
              reservationId: created.id,
              status: 'confirmed'
            })
          )
        ).code
      ).toBe('FORBIDDEN')

      const [mine] = await ctx.fan.mine()
      expect(mine?.status).toBe('pending')
    } finally {
      await ctx.db.delete(user).where(eq(user.id, intruderId))
      await ctx.cleanup()
    }
  }
)

/* Teto por jogo (WEB-152) */

integrationTest(
  'teto conta só confirmadas, fecha pedidos novos e libera no cancelamento',
  async () => {
    const ctx = await seed()
    const extraFans = [crypto.randomUUID(), crypto.randomUUID()]
    try {
      const { appRouter } = await import('./index')
      await ctx.db.insert(user).values(
        extraFans.map((id) => ({
          id,
          role: 'fan' as const,
          name: 'Conta fan',
          email: `${id}@integration.invalid`,
          emailVerified: true,
          onboardingCompleted: true
        }))
      )
      const [third, fourth] = extraFans.map(
        (id) => appRouter.createCaller(contextFor(id, 'fan')).reservations
      )
      if (!third || !fourth) throw new Error('torcedores não criados')
      const profile = async () => {
        const pub = await appRouter
          .createCaller(contextFor(extraFans[0] ?? '', 'fan'))
          .pubs.getById({ id: ctx.barId })
        return pub.events.find(({ id }) => id === ctx.futureId)
      }

      await ctx.queue.setDefaultCap({ reservationCap: 5 })

      // Pendentes não ocupam lugar: 6 pessoas pedindo num teto de 5 passam.
      const first = await ctx.fan.create(ctx.request())
      const second = await ctx.otherFan.create(ctx.request())
      // Confirmar além do teto é permitido; o teto só fecha pedidos novos.
      for (const { id } of [first, second]) {
        await ctx.queue.respond({ reservationId: id, status: 'confirmed' })
      }

      expect(await refusal(third.create(ctx.request()))).toEqual({
        code: 'UNPROCESSABLE_CONTENT',
        message: 'Reservas esgotadas para este jogo.'
      })
      const soldOut = await profile()
      expect(soldOut?.reservationsSoldOut).toBe(true)
      expect(soldOut).not.toHaveProperty('reservationCap')
      const capacity = await ctx.queue.capacity()
      expect(capacity.defaultCap).toBe(5)
      expect(
        capacity.games.find(({ id }) => id === ctx.futureId)
      ).toMatchObject({ reservationCap: null, confirmedSeats: 6 })

      // Cancelar uma confirmada libera o lugar.
      await ctx.fan.cancel({ reservationId: first.id })
      expect((await profile())?.reservationsSoldOut).toBe(false)
      await third.create(ctx.request())

      // O override do jogo vence o padrão do bar; `null` volta ao padrão.
      await ctx.queue.setGameCap({ eventId: ctx.futureId, reservationCap: 3 })
      expect((await refusal(fourth.create(ctx.request()))).code).toBe(
        'UNPROCESSABLE_CONTENT'
      )
      await ctx.queue.setGameCap({
        eventId: ctx.futureId,
        reservationCap: null
      })
      await fourth.create(ctx.request())
    } finally {
      await ctx.db.delete(user).where(inArray(user.id, extraFans))
      await ctx.cleanup()
    }
  }
)

integrationTest('sem teto no bar nem no jogo, não há teto', async () => {
  const ctx = await seed()
  try {
    const created = await ctx.fan.create({ ...ctx.request(), partySize: 20 })
    await ctx.queue.respond({ reservationId: created.id, status: 'confirmed' })
    await ctx.otherFan.create(ctx.request())
    await expect(
      ctx.queue.setDefaultCap({ reservationCap: 0 })
    ).rejects.toBeInstanceOf(TRPCError)
  } finally {
    await ctx.cleanup()
  }
})

integrationTest(
  'pedido sem resposta até o fim do jogo expira para o torcedor e para o bar',
  async () => {
    const ctx = await seed()
    try {
      const created = await ctx.fan.create(ctx.request())
      // O jogo começou há 5h: o fim derivado (início + duração padrão) passou.
      await ctx.db
        .update(event)
        .set({ startsAt: new Date(Date.now() - 5 * HOUR) })
        .where(eq(event.id, ctx.futureId))

      const [mine] = await ctx.fan.mine()
      expect(mine).toMatchObject({
        id: created.id,
        status: 'expired',
        code: null,
        canCancel: false
      })
      expect(await ctx.queue.list()).toEqual([])
      // Expirado é final: o dono não confirma um jogo que já acabou.
      expect(
        (
          await refusal(
            ctx.queue.respond({
              reservationId: created.id,
              status: 'confirmed'
            })
          )
        ).code
      ).toBe('PRECONDITION_FAILED')
      const [after] = await ctx.fan.mine()
      expect(after?.status).toBe('expired')
    } finally {
      await ctx.cleanup()
    }
  }
)
