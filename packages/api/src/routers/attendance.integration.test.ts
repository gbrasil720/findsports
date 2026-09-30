import { expect, test } from 'bun:test'
import { eq, inArray } from '@findsports_oficial/db'
import { attendance } from '@findsports_oficial/db/schema/attendance'
import { user } from '@findsports_oficial/db/schema/auth'
import {
  bar,
  event,
  sport,
  subscription
} from '@findsports_oficial/db/schema/platform'
import { isDisposableTestDatabase } from '@findsports_oficial/db/utils/db-resolver'
import { TRPCError } from '@trpc/server'
import { ATTENDANCE_DISPLAY_FLOOR } from '../lib/attendance'

/**
 * "Vou assistir aqui" (WEB-127) contra o banco de verdade: unicidade pela
 * chave, reserva que marca presença, piso de exibição e o sinal do bar sem
 * número absoluto.
 */

const integrationTest = isDisposableTestDatabase() ? test : test.skip

type Role = 'pub' | 'fan'

const HOUR = 3_600_000
const DAY = 24 * HOUR

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

/** `offsets` em ms a partir de agora; o padrão é um jogo futuro e um ao vivo. */
async function seed(
  options: { elite?: boolean; fans?: number; offsets?: number[] } = {}
) {
  const [{ db }, { appRouter }] = await Promise.all([
    import('@findsports_oficial/db'),
    import('./index')
  ])
  const ownerId = crypto.randomUUID()
  const fanIds = Array.from({ length: options.fans ?? 2 }, () =>
    crypto.randomUUID()
  )
  const barId = crypto.randomUUID()
  const sportId = crypto.randomUUID()

  await db.insert(user).values(
    [
      { id: ownerId, role: 'pub' as const },
      ...fanIds.map((id) => ({ id, role: 'fan' as const }))
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
    name: 'Bar da presença',
    address: 'Rua descartável, 1',
    neighborhood: 'Teste',
    city: 'Teste',
    latitude: '-23.55052000',
    longitude: '-46.63330800',
    isActive: true,
    acceptsReservations: options.elite ?? false
  })
  if (options.elite) {
    await db.insert(subscription).values({
      barId,
      plan: 'elite',
      status: 'active',
      currentPeriodEnd: new Date(Date.now() + 30 * DAY)
    })
  }
  await db.insert(sport).values({
    id: sportId,
    name: `Esporte ${sportId}`,
    slug: `integration-${sportId}`
  })
  const games = await db
    .insert(event)
    .values(
      (options.offsets ?? [DAY, -HOUR]).map((offset) => ({
        barId,
        sportId,
        championship: 'Campeonato de integração',
        participantFreeText: 'Time A × Time B',
        startsAt: new Date(Date.now() + offset)
      }))
    )
    .returning({ id: event.id })

  const caller = (userId: string, role: Role) =>
    appRouter.createCaller(contextFor(userId, role))

  return {
    db,
    barId,
    gameIds: games.map(({ id }) => id),
    fanIds,
    fan: (index = 0) => caller(fanIds[index] as string, 'fan'),
    owner: caller(ownerId, 'pub'),
    /** Presenças gravadas direto: jogo encerrado não aceita pela API. */
    attend: (eventId: string, fans: string[]) =>
      fans.length
        ? db
            .insert(attendance)
            .values(fans.map((userId) => ({ userId, eventId })))
        : Promise.resolve(),
    presences: (eventId: string) =>
      db.select().from(attendance).where(eq(attendance.eventId, eventId)),
    cleanup: async () => {
      await db.delete(user).where(inArray(user.id, [ownerId, ...fanIds]))
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
  return (error as TRPCError).code
}

integrationTest(
  'torcedor marca e desmarca presença, uma só por jogo, em bar sem plano',
  async () => {
    const ctx = await seed()
    const [future, past] = ctx.gameIds as [string, string]
    try {
      const api = ctx.fan().attendance
      await api.set({ eventId: future, attending: true })
      await api.set({ eventId: future, attending: true })
      expect(await ctx.presences(future)).toHaveLength(1)

      const marked = await ctx.fan().pubs.getById({ id: ctx.barId })
      expect(marked.events.find(({ id }) => id === future)?.attendance).toEqual(
        { attending: true, count: null }
      )

      // Jogo que já começou não oferece o botão.
      expect(marked.events.find(({ id }) => id === past)?.attendance).toBeNull()

      await api.set({ eventId: future, attending: false })
      expect(await ctx.presences(future)).toHaveLength(0)

      expect(await refusal(api.set({ eventId: past, attending: true }))).toBe(
        'PRECONDITION_FAILED'
      )
      expect(
        await refusal(
          ctx.owner.attendance.set({ eventId: future, attending: true })
        )
      ).toBe('FORBIDDEN')
    } finally {
      await ctx.cleanup()
    }
  }
)

integrationTest(
  'reserva marca presença e esconde o botão; cancelar mantém a presença',
  async () => {
    const ctx = await seed({ elite: true })
    const [future] = ctx.gameIds as [string]
    try {
      const created = await ctx.fan().reservations.create({
        requestId: crypto.randomUUID(),
        eventId: future,
        partySize: 2
      })
      const reserved = await ctx.fan().pubs.getById({ id: ctx.barId })
      expect(
        reserved.events.find(({ id }) => id === future)?.attendance
      ).toBeNull()

      await ctx.fan().reservations.cancel({ reservationId: created.id })
      const cancelled = await ctx.fan().pubs.getById({ id: ctx.barId })
      expect(
        cancelled.events.find(({ id }) => id === future)?.attendance
      ).toEqual({ attending: true, count: null })
      expect(await ctx.presences(future)).toHaveLength(1)
    } finally {
      await ctx.cleanup()
    }
  }
)

integrationTest(
  'contagem só aparece ao torcedor a partir do piso, e nunca ao dono',
  async () => {
    const ctx = await seed({ fans: ATTENDANCE_DISPLAY_FLOOR + 1 })
    const [future] = ctx.gameIds as [string]
    const countFor = async () =>
      (await ctx.fan(0).pubs.getById({ id: ctx.barId })).events.find(
        ({ id }) => id === future
      )?.attendance?.count
    try {
      // O fã 0 olha sem ter marcado: a contagem vem antes de confirmar.
      const others = ctx.fanIds.slice(1)
      await ctx.attend(future, others.slice(0, ATTENDANCE_DISPLAY_FLOOR - 1))
      expect(await countFor()).toBeNull()

      await ctx.attend(future, others.slice(ATTENDANCE_DISPLAY_FLOOR - 1))
      expect(await countFor()).toBe(ATTENDANCE_DISPLAY_FLOOR)

      const preview = await ctx.owner.pubs.getById({ id: ctx.barId })
      expect(preview.events.every((game) => game.attendance === null)).toBe(
        true
      )
    } finally {
      await ctx.cleanup()
    }
  }
)

integrationTest(
  'painel do bar recebe o sinal relativo, nunca a contagem',
  async () => {
    // Quatro encerrados com presença: ainda sem histórico suficiente.
    const ctx = await seed({
      fans: 4,
      offsets: [DAY, -2 * DAY, -3 * DAY, -4 * DAY, -5 * DAY, -6 * DAY]
    })
    const [upcoming, ...ended] = ctx.gameIds as [string, ...string[]]
    const pair = ctx.fanIds.slice(0, 2)
    try {
      for (const game of ended.slice(0, 4)) await ctx.attend(game, pair)
      await ctx.attend(upcoming, ctx.fanIds)
      expect(await ctx.owner.pub.getMyInterest()).toEqual({
        status: 'gathering'
      })

      await ctx.attend(ended[4] as string, pair)
      expect(await ctx.owner.pub.getMyInterest()).toEqual({
        status: 'ready',
        events: [{ eventId: upcoming, ratio: 2 }]
      })
    } finally {
      await ctx.cleanup()
    }
  }
)
