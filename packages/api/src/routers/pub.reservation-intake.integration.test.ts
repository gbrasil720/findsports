import { expect, test } from 'bun:test'
import { eq } from '@findsports_oficial/db'
import {
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
import { inAMonth, load, seedBar, storedOffer } from './integration-seed'

/**
 * Recebimento de reservas por jogo contra o banco de verdade: o jogo nasce
 * desmarcado, só se marca com Elite vigente, o bar "recebe" enquanto tiver
 * jogo marcado no perfil, desmarcar esconde a oferta sem apagar o texto, e
 * reserva já feita sobrevive ao desmarque.
 */

const integrationTest = isDisposableTestDatabase() ? test : test.skip

const HOUR = 3_600_000

async function storedGameFlag(eventId: string) {
  const { db } = await load()
  const [row] = await db
    .select({ acceptsReservations: event.acceptsReservations })
    .from(event)
    .where(eq(event.id, eventId))
  return row?.acceptsReservations
}

async function createdGames(barId: string) {
  const { db } = await load()
  return db
    .select({ acceptsReservations: event.acceptsReservations })
    .from(event)
    .where(eq(event.barId, barId))
}

/** Esporte só para `pub.createEvent`, que confere o id. */
async function seedSport() {
  const { db } = await load()
  const id = crypto.randomUUID()
  await db.insert(sport).values({
    id,
    name: `Esporte ${id}`,
    slug: `integration-${id}`
  })
  return { id, drop: () => db.delete(sport).where(eq(sport.id, id)) }
}

const newGame = (sportId: string, acceptsReservations?: boolean) => ({
  sportId,
  championship: 'Campeonato de integração',
  startsAt: inAMonth().toISOString(),
  ...(acceptsReservations !== undefined && { acceptsReservations })
})

integrationTest(
  'jogo novo nasce desmarcado: bar Elite sem jogo marcado não recebe nem mostra a oferta',
  async () => {
    const ctx = await seedBar('elite', 'active', inAMonth())
    const game = await seedSport()
    try {
      await ctx.owner.pub.createEvent(newGame(game.id))
      expect(await createdGames(ctx.barId)).toEqual([
        { acceptsReservations: false }
      ])
      await ctx.owner.pub.updateHouseOffer({ houseOffer: 'Chopp em dobro' })

      expect((await ctx.owner.pub.getMe()).receivesReservations).toBe(false)
      const profile = await ctx.fan.pubs.getById({ id: ctx.barId })
      expect(profile.acceptsReservations).toBe(false)
      expect(profile.houseOffer).toBeNull()
      expect(profile.events[0]?.acceptsReservations).toBe(false)
    } finally {
      await ctx.cleanup()
      await game.drop()
    }
  }
)

integrationTest(
  'marcar e desmarcar o jogo reflete no perfil e no painel, e preserva o texto da oferta',
  async () => {
    const ctx = await seedBar('elite', 'active', inAMonth())
    const game = await seedSport()
    try {
      await ctx.owner.pub.updateHouseOffer({ houseOffer: 'Chopp em dobro' })
      await ctx.owner.pub.createEvent(newGame(game.id, true))
      const [created] = await ctx.db
        .select({ id: event.id })
        .from(event)
        .where(eq(event.barId, ctx.barId))
      if (!created) throw new Error('jogo não criado')
      // Um segundo jogo, desmarcado: o perfil diz qual recebe.
      const other = await ctx.seedGame({ acceptsReservations: false })

      expect((await ctx.owner.pub.getMe()).receivesReservations).toBe(true)
      let profile = await ctx.fan.pubs.getById({ id: ctx.barId })
      expect(profile.acceptsReservations).toBe(true)
      expect(profile.houseOffer).toBe('Chopp em dobro')
      expect(
        Object.fromEntries(
          profile.events.map((item) => [item.id, item.acceptsReservations])
        )
      ).toEqual({ [created.id]: true, [other]: false })

      await ctx.owner.pub.updateEvent({
        eventId: created.id,
        acceptsReservations: false
      })
      expect(await storedGameFlag(created.id)).toBe(false)
      expect((await ctx.owner.pub.getMe()).receivesReservations).toBe(false)
      profile = await ctx.fan.pubs.getById({ id: ctx.barId })
      expect(profile.acceptsReservations).toBe(false)
      expect(profile.houseOffer).toBeNull()
      expect(await storedOffer(ctx.barId)).toBe('Chopp em dobro')
      // A prévia do dono mostra o que o torcedor vê.
      expect(
        (await ctx.owner.pubs.getById({ id: ctx.barId })).houseOffer
      ).toBeNull()

      // Editar outro campo não mexe na marcação.
      await ctx.owner.pub.updateEvent({
        eventId: other,
        acceptsReservations: true
      })
      await ctx.owner.pub.updateEvent({
        eventId: other,
        championship: 'Outro campeonato'
      })
      expect(await storedGameFlag(other)).toBe(true)
    } finally {
      await ctx.cleanup()
      await game.drop()
    }
  }
)

integrationTest(
  'só jogo que ainda não acabou faz o bar receber reservas',
  async () => {
    const ctx = await seedBar('elite', 'active', inAMonth())
    try {
      // Começou há 5h e não tem fim: já acabou pelo fim derivado.
      await ctx.seedGame({ startsAt: new Date(Date.now() - 5 * HOUR) })
      await ctx.seedGame({ acceptsReservations: false })

      expect((await ctx.owner.pub.getMe()).receivesReservations).toBe(false)
      const profile = await ctx.fan.pubs.getById({ id: ctx.barId })
      expect(profile.acceptsReservations).toBe(false)
      expect(profile.amenities).not.toContain(10)
    } finally {
      await ctx.cleanup()
    }
  }
)

for (const plan of ['starter', 'pro'] as const) {
  integrationTest(
    `bar ${plan} recebe recusa do servidor ao marcar o jogo para reservas`,
    async () => {
      const ctx = await seedBar(plan, 'active', inAMonth())
      const game = await seedSport()
      try {
        await expect(
          ctx.owner.pub.createEvent(newGame(game.id, true))
        ).rejects.toMatchObject({ code: 'FORBIDDEN' })
        expect(await createdGames(ctx.barId)).toEqual([])

        // Sem a marcação, o jogo é criado normalmente.
        await ctx.owner.pub.createEvent(newGame(game.id, false))
        const [created] = await ctx.db
          .select({ id: event.id })
          .from(event)
          .where(eq(event.barId, ctx.barId))
        if (!created) throw new Error('jogo não criado')
        await expect(
          ctx.owner.pub.updateEvent({
            eventId: created.id,
            acceptsReservations: true
          })
        ).rejects.toMatchObject({ code: 'FORBIDDEN' })
        expect(await storedGameFlag(created.id)).toBe(false)
      } finally {
        await ctx.cleanup()
        await game.drop()
      }
    }
  )
}

integrationTest(
  'perder o Elite corta o recebimento no perfil, e desmarcar continua possível',
  async () => {
    const ctx = await seedBar('elite', 'active', inAMonth())
    try {
      const gameId = await ctx.seedGame()
      expect(
        (await ctx.fan.pubs.getById({ id: ctx.barId })).acceptsReservations
      ).toBe(true)
      await ctx.db
        .update(subscription)
        .set({ status: 'past_due' })
        .where(eq(subscription.barId, ctx.barId))

      const profile = await ctx.fan.pubs.getById({ id: ctx.barId })
      expect(profile.acceptsReservations).toBe(false)
      expect(profile.events[0]?.acceptsReservations).toBe(false)
      expect((await ctx.owner.pub.getMe()).receivesReservations).toBe(false)
      await ctx.owner.pub.updateEvent({
        eventId: gameId,
        acceptsReservations: false
      })
      expect(await storedGameFlag(gameId)).toBe(false)
    } finally {
      await ctx.cleanup()
    }
  }
)

integrationTest(
  'desmarcar não mexe em reserva existente: código segue validável e a cópia da oferta fica',
  async () => {
    const ctx = await seedBar('elite', 'active', inAMonth())
    try {
      await ctx.owner.pub.updateHouseOffer({ houseOffer: 'Chopp em dobro' })
      const gameId = await ctx.seedGame()
      const [createdReservation] = await ctx.db
        .insert(reservation)
        .values({
          eventId: gameId,
          userId: ctx.fanId,
          partySize: 2,
          status: 'confirmed',
          offerSnapshot: 'Chopp em dobro'
        })
        .returning({ id: reservation.id })
      if (!createdReservation) throw new Error('reserva não criada')
      const [code] = await ctx.db
        .insert(reservationCode)
        .values({
          code: `W${crypto.randomUUID().replace(/-/g, '').slice(0, 9).toUpperCase()}`,
          reservationId: createdReservation.id,
          maxUses: 2
        })
        .returning({ id: reservationCode.id })
      if (!code) throw new Error('código não emitido')

      await ctx.owner.pub.updateEvent({
        eventId: gameId,
        acceptsReservations: false
      })

      const [kept] = await ctx.db
        .select({
          status: reservation.status,
          offerSnapshot: reservation.offerSnapshot
        })
        .from(reservation)
        .where(eq(reservation.id, createdReservation.id))
      expect(kept).toEqual({
        status: 'confirmed',
        offerSnapshot: 'Chopp em dobro'
      })
      // Código não foi aposentado: o banco ainda aceita uso.
      await ctx.db.insert(reservationCodeUse).values({ codeId: code.id })
      // E o torcedor ainda consegue cancelar.
      await ctx.db
        .update(reservation)
        .set({ status: 'cancelled' })
        .where(eq(reservation.id, createdReservation.id))
    } finally {
      await ctx.cleanup()
    }
  }
)
