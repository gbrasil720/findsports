import { expect, test } from 'bun:test'
import { and, eq, inArray } from '@findsports_oficial/db'
import { isReservationCodeComplete } from '@findsports_oficial/db/reservation-code'
import { attendance } from '@findsports_oficial/db/schema/attendance'
import { user } from '@findsports_oficial/db/schema/auth'
import {
  bar,
  event,
  sport,
  subscription
} from '@findsports_oficial/db/schema/platform'
import {
  reservation,
  reservationCode,
  reservationCodeUse
} from '@findsports_oficial/db/schema/reservation'
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

  /** Origem da presença do torcedor no jogo futuro; `null` sem presença. */
  const presenceOf = async (userId: string) => {
    const [row] = await db
      .select({ source: attendance.source })
      .from(attendance)
      .where(
        and(eq(attendance.userId, userId), eq(attendance.eventId, future.id))
      )
    return row?.source ?? null
  }

  return {
    db,
    barId,
    ownerId,
    fanId,
    otherFanId,
    futureId: future.id,
    pastId: past.id,
    fan: api(fanId, 'fan'),
    otherFan: api(otherFanId, 'fan'),
    owner: api(ownerId, 'pub'),
    queue: queue(ownerId),
    queueOf: queue,
    validation: appRouter.createCaller(contextFor(ownerId, 'pub'))
      .reservationValidation,
    pub: appRouter.createCaller(contextFor(ownerId, 'pub')).pub,
    attend: (userId: string, attending = true) =>
      appRouter
        .createCaller(contextFor(userId, 'fan'))
        .attendance.set({ eventId: future.id, attending }),
    presenceOf,
    /** Jogo daqui a 1h: a janela de validação já abriu e ainda dá para cancelar. */
    openWindow: () =>
      db
        .update(event)
        .set({ startsAt: new Date(Date.now() + HOUR) })
        .where(eq(event.id, future.id)),
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
  'trial Elite vencido: o bar gere e valida o que já existe, sem pedido novo nem teto (WEB-341)',
  async () => {
    const ctx = await seed()
    try {
      const confirmed = await ctx.fan.create(ctx.request())
      const pending = await ctx.otherFan.create(ctx.request())
      await ctx.queue.respond({
        reservationId: confirmed.id,
        status: 'confirmed'
      })
      await ctx.openWindow()

      // Como o trial do cadastro vence: `trialing` com o fim no passado.
      await ctx.db
        .update(subscription)
        .set({
          status: 'trialing',
          currentPeriodEnd: new Date(Date.now() - HOUR)
        })
        .where(eq(subscription.barId, ctx.barId))

      expect(await ctx.queue.hasOpen()).toBe(true)
      expect((await ctx.queue.list()).map(({ id }) => id).sort()).toEqual(
        [confirmed.id, pending.id].sort()
      )
      const found = await ctx.validation.lookup({ code: confirmed.code ?? '' })
      if (!found) throw new Error('código não resolveu')
      expect(
        (
          await ctx.validation.registerArrival({
            codeId: found.codeId,
            requestId: crypto.randomUUID()
          })
        ).usedCount
      ).toBe(1)
      expect(
        await ctx.queue.respond({
          reservationId: pending.id,
          status: 'declined'
        })
      ).toEqual({ status: 'declined', changed: true })

      // Nada de recurso novo: pedido, interruptor e teto seguem do Elite.
      expect(await refusal(ctx.otherFan.create(ctx.request()))).toEqual({
        code: 'PRECONDITION_FAILED',
        message: 'Este bar não está recebendo reservas pela Onside no momento.'
      })
      for (const attempt of [
        () => ctx.queue.capacity(),
        () => ctx.queue.setDefaultCap({ reservationCap: 10 }),
        () =>
          ctx.queue.setGameCap({ eventId: ctx.futureId, reservationCap: 10 }),
        () => ctx.pub.updateAcceptsReservations({ acceptsReservations: true })
      ]) {
        expect((await refusal(attempt())).code).toBe('FORBIDDEN')
      }

      // Jogo encerrado, nada em aberto: volta a recusa de quem não é Elite.
      await ctx.db
        .update(event)
        .set({ startsAt: new Date(Date.now() - 24 * HOUR) })
        .where(eq(event.id, ctx.futureId))
      expect(await ctx.queue.hasOpen()).toBe(false)
      expect((await refusal(ctx.queue.list())).code).toBe('FORBIDDEN')
      expect(
        (await refusal(ctx.validation.lookup({ code: confirmed.code ?? '' })))
          .code
      ).toBe('FORBIDDEN')
    } finally {
      await ctx.cleanup()
    }
  }
)

integrationTest(
  'dono de outro bar não lê nem responde; sem Elite e sem reserva em aberto ninguém responde',
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

      // Sem Elite e com o pedido já fora de aberto, a fila fecha (WEB-341).
      await ctx.fan.cancel({ reservationId: created.id })
      await ctx.db
        .update(subscription)
        .set({ status: 'past_due' })
        .where(eq(subscription.barId, ctx.barId))
      expect(await ctx.queue.hasOpen()).toBe(false)
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
      expect(mine?.status).toBe('cancelled')
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
  'reserva confirmada vira jogo encerrado no fim do jogo e perde o código quando a janela fecha',
  async () => {
    const ctx = await seed()
    try {
      const created = await ctx.fan.create(ctx.request())
      await ctx.queue.respond({
        reservationId: created.id,
        status: 'confirmed'
      })
      const startedAgo = (hours: number) =>
        ctx.db
          .update(event)
          .set({ startsAt: new Date(Date.now() - hours * HOUR) })
          .where(eq(event.id, ctx.futureId))

      // Fim derivado há 1h: a janela de validação ainda está aberta.
      await startedAgo(4)
      const [open] = await ctx.fan.mine()
      expect(open).toMatchObject({
        status: 'ended',
        code: created.code,
        canCancel: false
      })
      expect(open?.window).not.toBeNull()

      // Fim derivado há 4h: a janela fechou.
      await startedAgo(7)
      const [closed] = await ctx.fan.mine()
      expect(closed).toMatchObject({
        status: 'ended',
        code: null,
        window: null,
        canCancel: false
      })
    } finally {
      await ctx.cleanup()
    }
  }
)

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

/* Chegada registrada trava o cancelamento (WEB-259) */

integrationTest(
  'chegada registrada aparece para o torcedor e trava o cancelamento; desfeita, libera',
  async () => {
    const ctx = await seed()
    try {
      const created = await ctx.fan.create(ctx.request())
      await ctx.queue.respond({
        reservationId: created.id,
        status: 'confirmed'
      })
      await ctx.openWindow()
      const found = await ctx.validation.lookup({ code: created.code ?? '' })
      if (!found) throw new Error('código não resolveu')

      const [before] = await ctx.fan.mine()
      expect(before).toMatchObject({ arrival: null, canCancel: true })

      const arrival = await ctx.validation.registerArrival({
        codeId: found.codeId,
        requestId: crypto.randomUUID()
      })
      const [arrived] = await ctx.fan.mine()
      expect(arrived).toMatchObject({
        status: 'confirmed',
        code: created.code,
        arrival: { count: 1, of: 3 },
        canCancel: false
      })
      expect(arrived?.arrival?.lastAt).toBeInstanceOf(Date)

      expect(
        await refusal(ctx.fan.cancel({ reservationId: created.id }))
      ).toEqual({
        code: 'CONFLICT',
        message:
          'O bar já registrou chegada nesta reserva. Ela não pode mais ser cancelada.'
      })
      const [code] = await ctx.db
        .select({ retiredAt: reservationCode.retiredAt })
        .from(reservationCode)
        .where(eq(reservationCode.reservationId, created.id))
      expect(code?.retiredAt).toBeNull()

      // O contador é a regra: chegada desfeita devolve o cancelamento.
      await ctx.validation.undoArrival({ useId: arrival.useId })
      const [undone] = await ctx.fan.mine()
      expect(undone).toMatchObject({ arrival: null, canCancel: true })
      expect((await ctx.fan.cancel({ reservationId: created.id })).status).toBe(
        'cancelled'
      )
    } finally {
      await ctx.cleanup()
    }
  }
)

integrationTest(
  'cancelamento espera a chegada que está sendo gravada e não deixa reserva cancelada com chegada',
  async () => {
    const ctx = await seed()
    try {
      const created = await ctx.fan.create(ctx.request())
      await ctx.queue.respond({
        reservationId: created.id,
        status: 'confirmed'
      })
      await ctx.openWindow()
      const found = await ctx.validation.lookup({ code: created.code ?? '' })
      if (!found) throw new Error('código não resolveu')

      // A chegada já somou no código, mas a transação dela ainda não fechou:
      // quem lê o contador sem travar a linha vê zero e cancela por cima.
      let cancelling: ReturnType<typeof refusal> | undefined
      await ctx.db.transaction(async (tx) => {
        await tx.insert(reservationCodeUse).values({ codeId: found.codeId })
        cancelling = refusal(ctx.fan.cancel({ reservationId: created.id }))
        await new Promise((resolve) => setTimeout(resolve, 200))
      })
      expect((await cancelling)?.code).toBe('CONFLICT')

      const [row] = await ctx.db
        .select({
          status: reservation.status,
          usedCount: reservationCode.usedCount,
          retiredAt: reservationCode.retiredAt
        })
        .from(reservation)
        .innerJoin(
          reservationCode,
          eq(reservationCode.reservationId, reservation.id)
        )
        .where(eq(reservation.id, created.id))
      expect(row).toEqual({
        status: 'confirmed',
        usedCount: 1,
        retiredAt: null
      })

      // No outro sentido quem recusa é a trigger: código aposentado pelo
      // cancelamento não aceita chegada.
      const other = await ctx.otherFan.create(ctx.request())
      await ctx.queue.respond({ reservationId: other.id, status: 'confirmed' })
      const otherCode = await ctx.validation.lookup({ code: other.code ?? '' })
      if (!otherCode) throw new Error('código não resolveu')
      await ctx.otherFan.cancel({ reservationId: other.id })
      expect(
        (
          await refusal(
            ctx.validation.registerArrival({
              codeId: otherCode.codeId,
              requestId: crypto.randomUUID()
            })
          )
        ).code
      ).toBe('NOT_FOUND')
    } finally {
      await ctx.cleanup()
    }
  }
)

/* Origem da presença (WEB-296) */

integrationTest(
  'recusa apaga só a presença que veio da reserva; a marcada à mão fica',
  async () => {
    const ctx = await seed()
    try {
      // Um chega pela reserva; o outro já tinha marcado "Vou assistir aqui".
      await ctx.attend(ctx.otherFanId)
      const fromReservation = await ctx.fan.create(ctx.request())
      const alreadyMarked = await ctx.otherFan.create(ctx.request())
      expect(await ctx.presenceOf(ctx.fanId)).toBe('reservation')
      expect(await ctx.presenceOf(ctx.otherFanId)).toBe('manual')
      expect(fromReservation.attending).toBe(true)

      for (const { id } of [fromReservation, alreadyMarked]) {
        await ctx.queue.respond({ reservationId: id, status: 'declined' })
      }
      expect(await ctx.presenceOf(ctx.fanId)).toBeNull()
      expect(await ctx.presenceOf(ctx.otherFanId)).toBe('manual')
      const [declined] = await ctx.fan.mine()
      expect(declined).toMatchObject({ status: 'declined', attending: false })
      const [kept] = await ctx.otherFan.mine()
      expect(kept).toMatchObject({ status: 'declined', attending: true })

      // Marcar à mão em cima da presença da reserva a torna do torcedor.
      const again = await ctx.fan.create(ctx.request())
      expect(await ctx.presenceOf(ctx.fanId)).toBe('reservation')
      await ctx.attend(ctx.fanId)
      expect(await ctx.presenceOf(ctx.fanId)).toBe('manual')
      await ctx.queue.respond({ reservationId: again.id, status: 'declined' })
      expect(await ctx.presenceOf(ctx.fanId)).toBe('manual')
    } finally {
      await ctx.cleanup()
    }
  }
)

integrationTest(
  'cancelar mantém a presença, e o torcedor desmarca se quiser',
  async () => {
    const ctx = await seed()
    try {
      const created = await ctx.fan.create(ctx.request())
      const cancelled = await ctx.fan.cancel({ reservationId: created.id })
      expect(cancelled).toMatchObject({ status: 'cancelled', attending: true })
      expect(await ctx.presenceOf(ctx.fanId)).toBe('reservation')

      await ctx.attend(ctx.fanId, false)
      const [mine] = await ctx.fan.mine()
      expect(mine?.attending).toBe(false)
    } finally {
      await ctx.cleanup()
    }
  }
)

/* Aviso de resposta do bar (WEB-318) */

integrationTest(
  'a data da resposta do bar só existe em reserva confirmada ou recusada de jogo que não acabou',
  async () => {
    const ctx = await seed()
    try {
      const confirmed = await ctx.fan.create(ctx.request())
      const declined = await ctx.otherFan.create(ctx.request())
      expect(confirmed.decidedAt).toBeNull()

      const askedAt = Date.now()
      await ctx.queue.respond({
        reservationId: confirmed.id,
        status: 'confirmed'
      })
      await ctx.queue.respond({
        reservationId: declined.id,
        status: 'declined'
      })
      const [mine] = await ctx.fan.mine()
      expect(mine?.decidedAt?.getTime()).toBeGreaterThanOrEqual(askedAt)
      const [theirs] = await ctx.otherFan.mine()
      expect(theirs?.decidedAt?.getTime()).toBeGreaterThanOrEqual(askedAt)

      // Cancelada pelo torcedor não é resposta do bar.
      const cancelled = await ctx.fan.cancel({ reservationId: confirmed.id })
      expect(cancelled.decidedAt).toBeNull()

      // Jogo encerrado: a recusa deixa de ser notícia.
      await ctx.db
        .update(event)
        .set({ startsAt: new Date(Date.now() - 5 * HOUR) })
        .where(eq(event.id, ctx.futureId))
      const [after] = await ctx.otherFan.mine()
      expect(after).toMatchObject({ status: 'declined', decidedAt: null })
    } finally {
      await ctx.cleanup()
    }
  }
)

/* Bar fora do ar (WEB-360) */

integrationTest(
  'bar fora do ar: a reserva segue valendo e só quem tem reserva lá fica sabendo que ele saiu',
  async () => {
    const ctx = await seed()
    try {
      const { appRouter } = await import('./index')
      const profile = (context: Parameters<typeof appRouter.createCaller>[0]) =>
        appRouter.createCaller(context).pubs.getById({ id: ctx.barId })
      const notFound = {
        code: 'NOT_FOUND',
        message: 'Bar não encontrado.'
      } as const

      const created = await ctx.fan.create(ctx.request())
      await ctx.queue.respond({
        reservationId: created.id,
        status: 'confirmed'
      })
      expect((await ctx.fan.mine())[0]?.bar.isActive).toBe(true)

      // É o que a reconciliação diária faz com teste vencido (WEB-357).
      await ctx.db
        .update(bar)
        .set({ isActive: false })
        .where(eq(bar.id, ctx.barId))

      // A reserva não muda: confirmada, com código, e o dono ainda o valida.
      const [mine] = await ctx.fan.mine()
      expect(mine).toMatchObject({
        status: 'confirmed',
        code: created.code,
        bar: { id: ctx.barId, name: 'Bar da reserva', isActive: false }
      })
      await ctx.openWindow()
      expect(
        (await ctx.validation.lookup({ code: created.code ?? '' }))
          ?.reservationStatus
      ).toBe('confirmed')

      // O perfil segue fechado para todos menos o dono, e a recusa do
      // torcedor com reserva é a mesma de quem não tem nada lá e a mesma de
      // um id que não existe: quem não tem reserva não distingue os casos.
      expect(await refusal(profile(contextFor(ctx.fanId, 'fan')))).toEqual(
        notFound
      )
      expect(await refusal(profile(contextFor(ctx.otherFanId, 'fan')))).toEqual(
        notFound
      )
      expect(
        await refusal(
          appRouter
            .createCaller(contextFor(ctx.otherFanId, 'fan'))
            .pubs.getById({ id: crypto.randomUUID() })
        )
      ).toEqual(notFound)
      expect(await ctx.otherFan.mine()).toEqual([])
      expect((await profile(contextFor(ctx.ownerId, 'pub'))).isActive).toBe(
        false
      )

      // Sem sessão, nem o perfil nem a lista respondem.
      const anonymous = { auth: null, session: null, clientIp: '127.0.0.1' }
      expect((await refusal(profile(anonymous))).code).toBe('UNAUTHORIZED')
      expect(
        (await refusal(appRouter.createCaller(anonymous).reservations.mine()))
          .code
      ).toBe('UNAUTHORIZED')
    } finally {
      await ctx.cleanup()
    }
  }
)
