import { expect, test } from 'bun:test'
import { eq } from '@findsports_oficial/db'
import { attendance } from '@findsports_oficial/db/schema/attendance'
import { user } from '@findsports_oficial/db/schema/auth'
import { event, sport } from '@findsports_oficial/db/schema/platform'
import { barRating } from '@findsports_oficial/db/schema/rating'
import {
  type ReservationStatus,
  reservation
} from '@findsports_oficial/db/schema/reservation'
import { isDisposableTestDatabase } from '@findsports_oficial/db/utils/db-resolver'
import { inAMonth, refusal, seedBar } from './integration-seed'

/**
 * Excluir jogo (WEB-252) contra o banco de verdade: reserva pendente ou
 * confirmada e avaliação bloqueiam; reserva encerrada e presença vão junto; e
 * a grade recebe as contagens sem o número de presenças (ADR 0003).
 */

const integrationTest = isDisposableTestDatabase() ? test : test.skip

const HOUR = 3_600_000

async function seedGame() {
  const ctx = await seedBar('elite', 'active', inAMonth())
  const sportId = crypto.randomUUID()
  await ctx.db.insert(sport).values({
    id: sportId,
    name: `Esporte ${sportId}`,
    slug: `integration-${sportId}`
  })
  const fanIds = [ctx.fanId]

  const addGame = async (startsAt = new Date(Date.now() + 24 * HOUR)) => {
    const [game] = await ctx.db
      .insert(event)
      .values({ barId: ctx.barId, sportId, championship: 'WEB-252', startsAt })
      .returning({ id: event.id })
    if (!game) throw new Error('jogo não criado')
    return game.id
  }
  // Um torcedor por reserva: o índice de pedido ativo é por torcedor e jogo.
  const addReservation = async (eventId: string, status: ReservationStatus) => {
    const userId = crypto.randomUUID()
    fanIds.push(userId)
    await ctx.db.insert(user).values({
      id: userId,
      name: 'Torcedor WEB-252',
      email: `${userId}@integration.invalid`,
      emailVerified: true,
      role: 'fan',
      onboardingCompleted: true
    })
    await ctx.db
      .insert(reservation)
      .values({ eventId, userId, partySize: 2, status })
    await ctx.db.insert(attendance).values({ eventId, userId })
  }
  const exists = async (eventId: string) =>
    (await ctx.db.select().from(event).where(eq(event.id, eventId))).length ===
    1

  return {
    ...ctx,
    addGame,
    addReservation,
    exists,
    cleanup: async () => {
      await ctx.cleanup()
      for (const id of fanIds) await ctx.db.delete(user).where(eq(user.id, id))
      await ctx.db.delete(sport).where(eq(sport.id, sportId))
    }
  }
}

for (const status of ['pending', 'confirmed'] as const) {
  integrationTest(
    `reserva ${status} bloqueia a exclusão e nada é apagado`,
    async () => {
      const ctx = await seedGame()
      try {
        const eventId = await ctx.addGame()
        await ctx.addReservation(eventId, status)
        await ctx.addReservation(eventId, 'declined')

        expect(await refusal(ctx.owner.pub.deleteEvent({ eventId }))).toEqual({
          code: 'PRECONDITION_FAILED',
          message: 'Este jogo tem 1 reserva ativa e não pode ser excluído.'
        })
        expect(await ctx.exists(eventId)).toBe(true)
        expect(
          await ctx.db
            .select()
            .from(reservation)
            .where(eq(reservation.eventId, eventId))
        ).toHaveLength(2)
      } finally {
        await ctx.cleanup()
      }
    }
  )
}

integrationTest('avaliação bloqueia a exclusão', async () => {
  const ctx = await seedGame()
  try {
    const eventId = await ctx.addGame(new Date(Date.now() - 24 * HOUR))
    await ctx.db.insert(barRating).values({
      barId: ctx.barId,
      actorUserId: ctx.fanId,
      eventId,
      wouldReturn: false
    })

    expect(await refusal(ctx.owner.pub.deleteEvent({ eventId }))).toEqual({
      code: 'PRECONDITION_FAILED',
      message: 'Este jogo tem 1 avaliação e não pode ser excluído.'
    })
    expect(await ctx.exists(eventId)).toBe(true)
  } finally {
    await ctx.cleanup()
  }
})

integrationTest(
  'pedido que chega durante a exclusão não é apagado junto',
  async () => {
    const ctx = await seedGame()
    try {
      const eventId = await ctx.addGame()
      let deletion: ReturnType<typeof refusal> | undefined
      await ctx.db.transaction(async (tx) => {
        await tx
          .insert(reservation)
          .values({ eventId, userId: ctx.fanId, partySize: 2 })
        // O pedido ainda não foi gravado: a exclusão para na trava do jogo
        // e só conta as reservas depois que ele entra.
        deletion = refusal(ctx.owner.pub.deleteEvent({ eventId }))
        await new Promise((resolve) => setTimeout(resolve, 200))
      })

      expect(await deletion).toEqual({
        code: 'PRECONDITION_FAILED',
        message: 'Este jogo tem 1 reserva ativa e não pode ser excluído.'
      })
      expect(await ctx.exists(eventId)).toBe(true)
    } finally {
      await ctx.cleanup()
    }
  }
)

integrationTest(
  'reserva recusada, cancelada ou expirada não bloqueia e vai junto',
  async () => {
    const ctx = await seedGame()
    try {
      const upcoming = await ctx.addGame()
      await ctx.addReservation(upcoming, 'declined')
      await ctx.addReservation(upcoming, 'cancelled')
      // Pendente de jogo que acabou: expirou sem resposta.
      const ended = await ctx.addGame(new Date(Date.now() - 24 * HOUR))
      await ctx.addReservation(ended, 'pending')

      for (const eventId of [upcoming, ended]) {
        await expect(ctx.owner.pub.deleteEvent({ eventId })).resolves.toEqual({
          success: true
        })
        expect(await ctx.exists(eventId)).toBe(false)
      }
    } finally {
      await ctx.cleanup()
    }
  }
)

integrationTest(
  'jogo sem nada é excluído, e o de outro bar responde como inexistente',
  async () => {
    const ctx = await seedGame()
    const other = await seedBar('elite', 'active', inAMonth())
    try {
      const eventId = await ctx.addGame()
      expect(await refusal(other.owner.pub.deleteEvent({ eventId }))).toEqual({
        code: 'NOT_FOUND',
        message: 'Evento não encontrado.'
      })
      expect(await ctx.exists(eventId)).toBe(true)

      await expect(ctx.owner.pub.deleteEvent({ eventId })).resolves.toEqual({
        success: true
      })
      expect(await ctx.exists(eventId)).toBe(false)
    } finally {
      await other.cleanup()
      await ctx.cleanup()
    }
  }
)

integrationTest(
  'a grade traz as contagens da exclusão, sem o número de presenças',
  async () => {
    const ctx = await seedGame()
    try {
      const busy = await ctx.addGame()
      await ctx.addReservation(busy, 'pending')
      await ctx.addReservation(busy, 'confirmed')
      await ctx.addReservation(busy, 'confirmed')
      await ctx.addReservation(busy, 'cancelled')
      const ended = await ctx.addGame(new Date(Date.now() - 24 * HOUR))
      await ctx.addReservation(ended, 'pending')
      await ctx.db.insert(barRating).values({
        barId: ctx.barId,
        actorUserId: ctx.fanId,
        eventId: ended,
        wouldReturn: true
      })
      const empty = await ctx.addGame()

      const events = await ctx.owner.pub.getMyEvents()
      const deletion = (id: string) =>
        events.find((item) => item.id === id)?.deletion
      expect(deletion(busy)).toEqual({
        pendingReservations: 1,
        confirmedReservations: 2,
        ratings: 0,
        closedReservations: 1,
        hasAttendance: true
      })
      expect(deletion(ended)).toEqual({
        pendingReservations: 0,
        confirmedReservations: 0,
        ratings: 1,
        closedReservations: 1,
        hasAttendance: true
      })
      expect(deletion(empty)).toEqual({
        pendingReservations: 0,
        confirmedReservations: 0,
        ratings: 0,
        closedReservations: 0,
        hasAttendance: false
      })
    } finally {
      await ctx.cleanup()
    }
  }
)
