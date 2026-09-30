import { expect, test } from 'bun:test'
import { eq } from '@findsports_oficial/db'
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
import { inAMonth, load, seedBar, storedOffer } from './integration-seed'

/**
 * Recebimento de reservas (WEB-131) contra o banco de verdade: o interruptor
 * nasce desligado, só liga com Elite vigente, desligar esconde a oferta do
 * perfil sem apagar o texto, e reserva já feita sobrevive ao desligamento.
 */

const integrationTest = isDisposableTestDatabase() ? test : test.skip

async function storedAcceptsReservations(barId: string) {
  const { db } = await load()
  const [row] = await db
    .select({ acceptsReservations: bar.acceptsReservations })
    .from(bar)
    .where(eq(bar.id, barId))
  return row?.acceptsReservations
}

integrationTest(
  'bar Elite novo começa com o recebimento desligado e sem oferta no perfil',
  async () => {
    const ctx = await seedBar('elite', 'active', inAMonth())
    try {
      expect((await ctx.owner.pub.getMe()).acceptsReservations).toBe(false)
      await ctx.owner.pub.updateHouseOffer({ houseOffer: 'Chopp em dobro' })

      const profile = await ctx.fan.pubs.getById({ id: ctx.barId })
      expect(profile.acceptsReservations).toBe(false)
      expect(profile.houseOffer).toBeNull()
    } finally {
      await ctx.cleanup()
    }
  }
)

integrationTest(
  'ligar e desligar reflete no perfil e preserva o texto da oferta',
  async () => {
    const ctx = await seedBar('elite', 'active', inAMonth())
    try {
      await ctx.owner.pub.updateHouseOffer({ houseOffer: 'Chopp em dobro' })

      const on = await ctx.owner.pub.updateAcceptsReservations({
        acceptsReservations: true
      })
      expect(on.acceptsReservations).toBe(true)
      let profile = await ctx.fan.pubs.getById({ id: ctx.barId })
      expect(profile.acceptsReservations).toBe(true)
      expect(profile.houseOffer).toBe('Chopp em dobro')

      const off = await ctx.owner.pub.updateAcceptsReservations({
        acceptsReservations: false
      })
      expect(off.acceptsReservations).toBe(false)
      profile = await ctx.fan.pubs.getById({ id: ctx.barId })
      expect(profile.acceptsReservations).toBe(false)
      expect(profile.houseOffer).toBeNull()
      expect(await storedOffer(ctx.barId)).toBe('Chopp em dobro')
      // A prévia do dono mostra o que o torcedor vê.
      expect(
        (await ctx.owner.pubs.getById({ id: ctx.barId })).houseOffer
      ).toBeNull()
    } finally {
      await ctx.cleanup()
    }
  }
)

for (const plan of ['starter', 'pro'] as const) {
  integrationTest(
    `bar ${plan} recebe recusa do servidor ao ligar o recebimento`,
    async () => {
      const ctx = await seedBar(plan, 'active', inAMonth())
      try {
        await expect(
          ctx.owner.pub.updateAcceptsReservations({ acceptsReservations: true })
        ).rejects.toMatchObject({ code: 'FORBIDDEN' })
        expect(await storedAcceptsReservations(ctx.barId)).toBe(false)
      } finally {
        await ctx.cleanup()
      }
    }
  )
}

integrationTest('torcedor não mexe no recebimento', async () => {
  const ctx = await seedBar('elite', 'active', inAMonth())
  try {
    await expect(
      ctx.fan.pub.updateAcceptsReservations({ acceptsReservations: true })
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  } finally {
    await ctx.cleanup()
  }
})

integrationTest(
  'perder o Elite corta o recebimento no perfil, e desligar continua possível',
  async () => {
    const ctx = await seedBar('elite', 'active', inAMonth())
    try {
      await ctx.owner.pub.updateAcceptsReservations({
        acceptsReservations: true
      })
      await ctx.db
        .update(subscription)
        .set({ status: 'past_due' })
        .where(eq(subscription.barId, ctx.barId))

      expect(
        (await ctx.fan.pubs.getById({ id: ctx.barId })).acceptsReservations
      ).toBe(false)
      await ctx.owner.pub.updateAcceptsReservations({
        acceptsReservations: false
      })
      expect(await storedAcceptsReservations(ctx.barId)).toBe(false)
    } finally {
      await ctx.cleanup()
    }
  }
)

integrationTest(
  'desligar não mexe em reserva existente: código segue validável e a cópia da oferta fica',
  async () => {
    const ctx = await seedBar('elite', 'active', inAMonth())
    const sportId = crypto.randomUUID()
    try {
      await ctx.owner.pub.updateAcceptsReservations({
        acceptsReservations: true
      })
      await ctx.owner.pub.updateHouseOffer({ houseOffer: 'Chopp em dobro' })

      await ctx.db.insert(sport).values({
        id: sportId,
        name: `Esporte ${sportId}`,
        slug: `integration-${sportId}`
      })
      const [createdEvent] = await ctx.db
        .insert(event)
        .values({
          barId: ctx.barId,
          sportId,
          championship: 'Campeonato de integração',
          startsAt: inAMonth()
        })
        .returning({ id: event.id })
      if (!createdEvent) throw new Error('evento não criado')
      const [createdReservation] = await ctx.db
        .insert(reservation)
        .values({
          eventId: createdEvent.id,
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

      await ctx.owner.pub.updateAcceptsReservations({
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
      await ctx.db.delete(sport).where(eq(sport.id, sportId))
    }
  }
)
