import { expect, test } from 'bun:test'
import { eq, inArray } from '@findsports_oficial/db'
import { rateLimit, user } from '@findsports_oficial/db/schema/auth'
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
import {
  VALIDATION_ATTEMPT_LIMIT,
  validationAttemptKey
} from '../lib/reservation-validation'
import {
  contextFor,
  inAMonth,
  load,
  type Plan,
  type Role,
  refusal,
  type Status
} from './integration-seed'

/**
 * Validação de código de reserva (WEB-126) contra o banco de verdade. Cada
 * teste é um critério de aceite do ticket; as regras de segurança — dono do
 * bar, resposta única, idempotência, limite de tentativas — só se provam com
 * a consulta e as triggers reais.
 */

const integrationTest = isDisposableTestDatabase() ? test : test.skip

const HOUR = 3_600_000

function newCode() {
  return crypto.randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase()
}

/**
 * Dois bares com dono, um torcedor, e no primeiro bar um jogo com reserva
 * confirmada e código ativo.
 */
async function seed(
  options: {
    plan?: Plan
    status?: Status
    currentPeriodEnd?: Date | null
    startsAt?: Date
    partySize?: number
  } = {}
) {
  const { db, appRouter } = await load()
  const ownerId = crypto.randomUUID()
  const rivalId = crypto.randomUUID()
  const fanId = crypto.randomUUID()
  const barId = crypto.randomUUID()
  const rivalBarId = crypto.randomUUID()
  const sportId = crypto.randomUUID()
  const code = newCode()
  const partySize = options.partySize ?? 3

  await db.insert(user).values(
    [
      { id: ownerId, role: 'pub' as const, name: 'Dono de integração' },
      { id: rivalId, role: 'pub' as const, name: 'Dono do bar vizinho' },
      { id: fanId, role: 'fan' as const, name: 'Torcedora de integração' }
    ].map((account) => ({
      ...account,
      email: `${account.id}@integration.invalid`,
      emailVerified: true,
      onboardingCompleted: true
    }))
  )
  await db.insert(bar).values(
    [
      { id: barId, userId: ownerId, name: 'Bar da validação' },
      { id: rivalBarId, userId: rivalId, name: 'Bar vizinho' }
    ].map((place) => ({
      ...place,
      address: 'Rua descartável, 1',
      neighborhood: 'Teste',
      city: 'Teste',
      latitude: '-23.55052000',
      longitude: '-46.63330800',
      isActive: true
    }))
  )
  await db.insert(subscription).values([
    {
      barId,
      plan: options.plan ?? 'elite',
      status: options.status ?? 'active',
      currentPeriodEnd:
        options.currentPeriodEnd === undefined
          ? inAMonth()
          : options.currentPeriodEnd
    },
    {
      barId: rivalBarId,
      plan: 'elite',
      status: 'active',
      currentPeriodEnd: inAMonth()
    }
  ])
  await db.insert(sport).values({
    id: sportId,
    name: `Esporte ${sportId}`,
    slug: `integration-${sportId}`
  })
  const [createdEvent] = await db
    .insert(event)
    .values({
      barId,
      sportId,
      championship: 'Campeonato de integração',
      participantFreeText: 'Time A × Time B',
      startsAt: options.startsAt ?? new Date()
    })
    .returning({ id: event.id })
  if (!createdEvent) throw new Error('evento não criado')
  const [createdReservation] = await db
    .insert(reservation)
    .values({
      eventId: createdEvent.id,
      userId: fanId,
      partySize,
      status: 'confirmed',
      offerSnapshot: 'Chopp em dobro'
    })
    .returning({ id: reservation.id })
  if (!createdReservation) throw new Error('reserva não criada')
  const [createdCode] = await db
    .insert(reservationCode)
    .values({ code, reservationId: createdReservation.id, maxUses: partySize })
    .returning({ id: reservationCode.id })
  if (!createdCode) throw new Error('código não criado')

  const api = (userId: string, role: Role) =>
    appRouter.createCaller(contextFor(userId, role)).reservationValidation

  return {
    db,
    code,
    codeId: createdCode.id,
    reservationId: createdReservation.id,
    barId,
    ownerId,
    rivalId,
    owner: api(ownerId, 'pub'),
    rival: api(rivalId, 'pub'),
    fan: api(fanId, 'fan'),
    cleanup: async () => {
      const accounts = [ownerId, rivalId, fanId]
      await db.delete(user).where(inArray(user.id, accounts))
      await db.delete(sport).where(eq(sport.id, sportId))
      await db
        .delete(rateLimit)
        .where(inArray(rateLimit.key, accounts.map(validationAttemptKey)))
    }
  }
}

type Seeded = Awaited<ReturnType<typeof seed>>

async function counterOf(ctx: Seeded) {
  const [row] = await ctx.db
    .select({ usedCount: reservationCode.usedCount })
    .from(reservationCode)
    .where(eq(reservationCode.id, ctx.codeId))
  return row?.usedCount
}

/**
 * Busca de código que precisa resolver. `lookup` devolve `null`, sem erro,
 * para código que não é do bar (WEB-316).
 */
async function resolved(caller: Seeded['owner'], code: string) {
  const found = await caller.lookup({ code })
  if (!found) throw new Error(`o código ${code} deveria resolver`)
  return found
}

async function usesOf(ctx: Seeded) {
  return ctx.db
    .select()
    .from(reservationCodeUse)
    .where(eq(reservationCodeUse.codeId, ctx.codeId))
}

integrationTest(
  'dono valida código do próprio bar e o contador avança',
  async () => {
    const ctx = await seed()
    try {
      // Digitado como se lê em voz alta: minúsculas e separador.
      const typed = `${ctx.code.slice(0, 4).toLowerCase()}-${ctx.code.slice(4).toLowerCase()} `
      const found = await resolved(ctx.owner, typed)

      expect(found).toMatchObject({
        codeId: ctx.codeId,
        code: ctx.code,
        guestName: 'Torcedora de integração',
        reservationStatus: 'confirmed',
        partySize: 3,
        offerSnapshot: 'Chopp em dobro',
        usedCount: 0,
        maxUses: 3
      })
      expect(found.event).toMatchObject({
        championship: 'Campeonato de integração',
        participantFreeText: 'Time A × Time B'
      })
      expect(found.window.opensAt.getTime()).toBeLessThan(Date.now())
      expect(found.window.closesAt.getTime()).toBeGreaterThan(Date.now())

      const first = await ctx.owner.registerArrival({
        codeId: ctx.codeId,
        requestId: crypto.randomUUID()
      })
      expect(first).toMatchObject({ usedCount: 1, maxUses: 3, replayed: false })

      const second = await ctx.owner.registerArrival({
        codeId: ctx.codeId,
        requestId: crypto.randomUUID()
      })
      expect(second.usedCount).toBe(2)

      const [use] = await usesOf(ctx)
      expect(use?.validatedByUserId).toBe(ctx.ownerId)
      expect((await resolved(ctx.owner, ctx.code)).usedCount).toBe(2)
    } finally {
      await ctx.cleanup()
    }
  }
)

integrationTest(
  'oferta mostrada é a congelada na reserva, não a atual do bar',
  async () => {
    const ctx = await seed()
    try {
      await ctx.db
        .update(bar)
        .set({ houseOffer: 'Oferta nova do bar' })
        .where(eq(bar.id, ctx.barId))

      const found = await resolved(ctx.owner, ctx.code)
      expect(found.offerSnapshot).toBe('Chopp em dobro')
    } finally {
      await ctx.cleanup()
    }
  }
)

integrationTest(
  'dono de outro bar recebe a mesma resposta de código inexistente',
  async () => {
    const ctx = await seed()
    try {
      // Uma resposta só, e sem erro (WEB-316): `null` nos três casos.
      expect(await ctx.rival.lookup({ code: 'ZZZZ9999' })).toBeNull()
      expect(await ctx.rival.lookup({ code: ctx.code })).toBeNull()
      expect(await ctx.rival.lookup({ code: '!!' })).toBeNull()

      // Mesmo de posse do id interno, o vizinho não queima o código.
      const burn = await refusal(
        ctx.rival.registerArrival({
          codeId: ctx.codeId,
          requestId: crypto.randomUUID()
        })
      )
      const burnMissing = await refusal(
        ctx.rival.registerArrival({
          codeId: crypto.randomUUID(),
          requestId: crypto.randomUUID()
        })
      )
      expect(burn.code).toBe('NOT_FOUND')
      expect(burnMissing).toEqual(burn)
      expect(await counterOf(ctx)).toBe(0)
      expect(await usesOf(ctx)).toHaveLength(0)
    } finally {
      await ctx.cleanup()
    }
  }
)

integrationTest(
  'reserva não confirmada resolve com o estado e recusa chegada',
  async () => {
    const ctx = await seed()
    try {
      // O código nasce com o pedido: pendente é estado normal de quem chega.
      for (const status of ['pending', 'declined', 'cancelled'] as const) {
        await ctx.db
          .update(reservation)
          .set({ status })
          .where(eq(reservation.id, ctx.reservationId))

        const found = await resolved(ctx.owner, ctx.code)
        expect(found.reservationStatus).toBe(status)
        expect(found.codeId).toBe(ctx.codeId)

        const refused = await refusal(
          ctx.owner.registerArrival({
            codeId: ctx.codeId,
            requestId: crypto.randomUUID()
          })
        )
        expect(refused.code).toBe('UNPROCESSABLE_CONTENT')
      }
      expect(await counterOf(ctx)).toBe(0)
      expect(await usesOf(ctx)).toHaveLength(0)

      // O estado é dado do bar dono: o vizinho continua sem ver nada.
      expect(await ctx.rival.lookup({ code: ctx.code })).toBeNull()
    } finally {
      await ctx.cleanup()
    }
  }
)

integrationTest('código aposentado não resolve', async () => {
  const ctx = await seed()
  try {
    await ctx.db
      .update(reservationCode)
      .set({ retiredAt: new Date() })
      .where(eq(reservationCode.id, ctx.codeId))
    expect(await ctx.owner.lookup({ code: ctx.code })).toBeNull()
    expect(
      await refusal(
        ctx.owner.registerArrival({
          codeId: ctx.codeId,
          requestId: crypto.randomUUID()
        })
      )
    ).toMatchObject({ code: 'NOT_FOUND' })
  } finally {
    await ctx.cleanup()
  }
})

integrationTest('duplo envio do +1 registra uma chegada só', async () => {
  const ctx = await seed()
  try {
    const requestId = crypto.randomUUID()
    const input = { codeId: ctx.codeId, requestId }

    // Simultâneos: o segundo espera a chave do primeiro e não insere.
    const results = await Promise.all([
      ctx.owner.registerArrival(input),
      ctx.owner.registerArrival(input),
      ctx.owner.registerArrival(input)
    ])
    // Tardio: retry que chega depois da resposta.
    const late = await ctx.owner.registerArrival(input)

    expect(results.filter((result) => !result.replayed)).toHaveLength(1)
    for (const result of [...results, late]) {
      expect(result.useId).toBe(requestId)
      expect(result.usedCount).toBe(1)
    }
    expect(late.replayed).toBe(true)
    expect(await counterOf(ctx)).toBe(1)
    expect(await usesOf(ctx)).toHaveLength(1)
  } finally {
    await ctx.cleanup()
  }
})

integrationTest(
  'repetição de chegada já gravada é reconhecida mesmo com a janela fechada',
  async () => {
    const ctx = await seed()
    try {
      const input = { codeId: ctx.codeId, requestId: crypto.randomUUID() }
      const first = await ctx.owner.registerArrival(input)
      expect(first).toMatchObject({ usedCount: 1, replayed: false })

      // A resposta se perdeu e, até a repetição chegar, a janela fechou.
      await ctx.db
        .update(event)
        .set({ startsAt: new Date(Date.now() - 12 * HOUR) })
        .where(eq(event.barId, ctx.barId))

      const retry = await ctx.owner.registerArrival(input)
      expect(retry).toMatchObject({
        useId: input.requestId,
        usedCount: 1,
        replayed: true
      })

      // Pedido novo continua recusado pela janela.
      const fresh = await refusal(
        ctx.owner.registerArrival({
          codeId: ctx.codeId,
          requestId: crypto.randomUUID()
        })
      )
      expect(fresh.code).toBe('PRECONDITION_FAILED')
      expect(await counterOf(ctx)).toBe(1)
    } finally {
      await ctx.cleanup()
    }
  }
)

integrationTest(
  'requestId de outra chegada não é aceito como repetição',
  async () => {
    const ctx = await seed()
    const other = await seed()
    try {
      const requestId = crypto.randomUUID()
      await other.owner.registerArrival({ codeId: other.codeId, requestId })

      const reused = await refusal(
        ctx.owner.registerArrival({ codeId: ctx.codeId, requestId })
      )
      expect(reused.code).toBe('CONFLICT')
      expect(await counterOf(ctx)).toBe(0)
      expect(await counterOf(other)).toBe(1)
    } finally {
      await ctx.cleanup()
      await other.cleanup()
    }
  }
)

integrationTest('maxUses + 1 falha com erro útil', async () => {
  const ctx = await seed({ partySize: 2 })
  try {
    const arrive = () =>
      ctx.owner.registerArrival({
        codeId: ctx.codeId,
        requestId: crypto.randomUUID()
      })
    await arrive()
    await arrive()

    const extra = await refusal(arrive())
    expect(extra.code).toBe('CONFLICT')
    expect(extra.message).toBe('As 2 pessoas desta reserva já foram validadas.')
    expect(await counterOf(ctx)).toBe(2)
    expect(await usesOf(ctx)).toHaveLength(2)

    // Disputa pelo último lugar: só um leva.
    const last = await seed({ partySize: 1 })
    try {
      const race = await Promise.allSettled([
        last.owner.registerArrival({
          codeId: last.codeId,
          requestId: crypto.randomUUID()
        }),
        last.owner.registerArrival({
          codeId: last.codeId,
          requestId: crypto.randomUUID()
        })
      ])
      expect(race.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
      const lost = race.find((r) => r.status === 'rejected')
      expect((lost as PromiseRejectedResult).reason).toMatchObject({
        code: 'CONFLICT',
        message: 'A única pessoa desta reserva já foi validada.'
      })
      expect(await counterOf(last)).toBe(1)
    } finally {
      await last.cleanup()
    }
  } finally {
    await ctx.cleanup()
  }
})

integrationTest(
  'desfazer reverte a última chegada dentro da janela curta',
  async () => {
    const ctx = await seed()
    try {
      const arrive = () =>
        ctx.owner.registerArrival({
          codeId: ctx.codeId,
          requestId: crypto.randomUUID()
        })
      const first = await arrive()
      const second = await arrive()

      // Só a última: a primeira tem uma chegada mais nova por cima.
      const notLast = await refusal(
        ctx.owner.undoArrival({ useId: first.useId })
      )
      expect(notLast).toEqual({
        code: 'PRECONDITION_FAILED',
        message: 'Só a última chegada pode ser desfeita.'
      })

      const undone = await ctx.owner.undoArrival({ useId: second.useId })
      expect(undone).toMatchObject({ usedCount: 1, maxUses: 3 })

      // Desfazer repetido não devolve o uso duas vezes.
      const again = await ctx.owner.undoArrival({ useId: second.useId })
      expect(again.usedCount).toBe(1)
      expect(await counterOf(ctx)).toBe(1)

      // O registro fica, marcado, para auditoria.
      const uses = await usesOf(ctx)
      expect(uses).toHaveLength(2)
      expect(
        uses.find((use) => use.id === second.useId)?.undoneAt
      ).not.toBeNull()

      // O `+1` repetido de uma chegada desfeita não a ressuscita.
      const replay = await ctx.owner.registerArrival({
        codeId: ctx.codeId,
        requestId: second.useId
      })
      expect(replay).toMatchObject({
        undone: true,
        replayed: true,
        usedCount: 1
      })

      // Desfeita a segunda, a primeira voltou a ser a última — mas o vizinho
      // não desfaz chegada do bar dos outros.
      const foreign = await refusal(
        ctx.rival.undoArrival({ useId: first.useId })
      )
      expect(foreign.code).toBe('NOT_FOUND')
      expect(await counterOf(ctx)).toBe(1)
    } finally {
      await ctx.cleanup()
    }
  }
)

integrationTest('desfazer depois do prazo é recusado', async () => {
  const ctx = await seed()
  try {
    const arrival = await ctx.owner.registerArrival({
      codeId: ctx.codeId,
      requestId: crypto.randomUUID()
    })
    await ctx.db
      .update(reservationCodeUse)
      .set({ usedAt: new Date(Date.now() - 5 * 60_000) })
      .where(eq(reservationCodeUse.id, arrival.useId))

    const late = await refusal(ctx.owner.undoArrival({ useId: arrival.useId }))
    expect(late).toEqual({
      code: 'PRECONDITION_FAILED',
      message: 'O prazo para desfazer esta chegada acabou.'
    })
    expect(await counterOf(ctx)).toBe(1)
  } finally {
    await ctx.cleanup()
  }
})

integrationTest(
  'código fora da janela recusa, informando quando vale',
  async () => {
    const early = await seed({ startsAt: inAMonth() })
    const late = await seed({ startsAt: new Date(Date.now() - 10 * HOUR) })
    try {
      const notOpen = await resolved(early.owner, early.code)
      expect(notOpen.window.opensAt.getTime()).toBe(
        notOpen.event.startsAt.getTime() - 3 * HOUR
      )
      const tooEarly = await refusal(
        early.owner.registerArrival({
          codeId: early.codeId,
          requestId: crypto.randomUUID()
        })
      )
      expect(tooEarly.code).toBe('PRECONDITION_FAILED')
      expect(tooEarly.message).toMatch(
        /^Este código ainda não abriu\. Ele vale a partir de \d{2}\/\d{2},? \d{2}:\d{2}\.$/
      )
      expect(await counterOf(early)).toBe(0)

      const closed = await resolved(late.owner, late.code)
      // Sem `endsAt`: início + 3h de jogo + 3h de margem.
      expect(closed.window.closesAt.getTime()).toBe(
        closed.event.startsAt.getTime() + 6 * HOUR
      )
      const tooLate = await refusal(
        late.owner.registerArrival({
          codeId: late.codeId,
          requestId: crypto.randomUUID()
        })
      )
      expect(tooLate.code).toBe('PRECONDITION_FAILED')
      expect(tooLate.message).toMatch(
        /^Este código expirou\. Ele valia até \d{2}\/\d{2},? \d{2}:\d{2}\.$/
      )
      expect(await counterOf(late)).toBe(0)
    } finally {
      await early.cleanup()
      await late.cleanup()
    }
  }
)

integrationTest(
  'tentativas repetidas com códigos inválidos são barradas pelo limite',
  async () => {
    const ctx = await seed()
    try {
      // Acertos não gastam o orçamento.
      for (let i = 0; i < VALIDATION_ATTEMPT_LIMIT.max + 5; i++) {
        await ctx.owner.lookup({ code: ctx.code })
      }

      for (let i = 0; i < VALIDATION_ATTEMPT_LIMIT.max; i++) {
        expect(await ctx.owner.lookup({ code: newCode() })).toBeNull()
      }

      const blocked = await refusal(ctx.owner.lookup({ code: newCode() }))
      expect(blocked.code).toBe('TOO_MANY_REQUESTS')

      // Bloqueado, nem o código certo resolve: senão a varredura continuaria.
      const blockedValid = await refusal(ctx.owner.lookup({ code: ctx.code }))
      expect(blockedValid).toEqual(blocked)

      // O limite é da conta que errou; o vizinho segue normal.
      expect(await ctx.rival.lookup({ code: newCode() })).toBeNull()

      // Passada a janela, volta a funcionar.
      await ctx.db
        .update(rateLimit)
        .set({ lastRequest: Date.now() - VALIDATION_ATTEMPT_LIMIT.windowMs })
        .where(eq(rateLimit.key, validationAttemptKey(ctx.ownerId)))
      expect((await resolved(ctx.owner, ctx.code)).codeId).toBe(ctx.codeId)
    } finally {
      await ctx.cleanup()
    }
  }
)

integrationTest(
  'rajada paralela de códigos errados não passa do limite',
  async () => {
    const ctx = await seed()
    try {
      const burst = await Promise.allSettled(
        Array.from({ length: VALIDATION_ATTEMPT_LIMIT.max * 3 }, () =>
          ctx.owner.lookup({ code: newCode() })
        )
      )
      // Só as que passaram pelo limite respondem (`null`); o resto é recusa.
      const looked = burst.filter((result) => result.status === 'fulfilled')
      expect(looked).toHaveLength(VALIDATION_ATTEMPT_LIMIT.max)
    } finally {
      await ctx.cleanup()
    }
  }
)

integrationTest('validar exige benefício Elite vigente', async () => {
  const cases: Array<{
    plan: Plan
    status: Status
    currentPeriodEnd: Date | null
    allowed: boolean
  }> = [
    { plan: 'elite', status: 'active', currentPeriodEnd: null, allowed: true },
    {
      plan: 'elite',
      status: 'trialing',
      currentPeriodEnd: inAMonth(),
      allowed: true
    },
    {
      plan: 'elite',
      status: 'trialing',
      currentPeriodEnd: new Date(Date.now() - HOUR),
      allowed: false
    },
    {
      plan: 'elite',
      status: 'past_due',
      currentPeriodEnd: inAMonth(),
      allowed: false
    },
    {
      plan: 'pro',
      status: 'active',
      currentPeriodEnd: inAMonth(),
      allowed: false
    }
  ]

  for (const { allowed, ...plan } of cases) {
    const ctx = await seed(plan)
    try {
      const arrival = {
        codeId: ctx.codeId,
        requestId: crypto.randomUUID()
      }
      if (allowed) {
        expect((await resolved(ctx.owner, ctx.code)).codeId).toBe(ctx.codeId)
        expect((await ctx.owner.registerArrival(arrival)).usedCount).toBe(1)
        continue
      }

      // Com reserva em aberto o bar ainda valida (WEB-341, coberto em
      // `reservations.integration.test.ts`); a recusa é de quem não tem o que
      // honrar.
      await ctx.db
        .update(reservation)
        .set({ status: 'cancelled' })
        .where(eq(reservation.id, ctx.reservationId))
      for (const attempt of [
        () => ctx.owner.lookup({ code: ctx.code }),
        () => ctx.owner.registerArrival(arrival),
        () => ctx.owner.undoArrival({ useId: crypto.randomUUID() })
      ]) {
        expect(await refusal(attempt())).toEqual({
          code: 'FORBIDDEN',
          message: 'A validação de reservas é um recurso do plano Elite.'
        })
      }
      expect(await counterOf(ctx)).toBe(0)
    } finally {
      await ctx.cleanup()
    }
  }
})

integrationTest('torcedor não valida código', async () => {
  const ctx = await seed()
  try {
    const denied = await refusal(ctx.fan.lookup({ code: ctx.code }))
    expect(denied.code).toBe('FORBIDDEN')
    expect(
      (
        await refusal(
          ctx.fan.registerArrival({
            codeId: ctx.codeId,
            requestId: crypto.randomUUID()
          })
        )
      ).code
    ).toBe('FORBIDDEN')
    expect(await counterOf(ctx)).toBe(0)
  } finally {
    await ctx.cleanup()
  }
})
