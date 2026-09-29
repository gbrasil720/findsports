import { expect, test } from 'bun:test'
import { eq } from '@findsports_oficial/db'
import { HOUSE_OFFER_MAX_LENGTH } from '@findsports_oficial/db/house-offer'
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

/**
 * Oferta da casa (WEB-120) e recebimento de reservas (WEB-131) contra o banco
 * de verdade: o plano é conferido no servidor a partir da assinatura, o perfil
 * público só mostra a oferta com Elite vigente E recebimento ligado, e perder
 * qualquer um dos dois esconde sem apagar — nem o texto do bar, nem a cópia
 * congelada numa reserva.
 */

const integrationTest = isDisposableTestDatabase() ? test : test.skip

type Role = 'pub' | 'fan'
type Plan = 'starter' | 'pro' | 'elite'
type Status = 'trialing' | 'active' | 'past_due'

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
        onboardingCompleted: true,
        searchRadiusKm: 3,
        twoFactorEnabled: false,
        createdAt: now,
        updatedAt: now
      }
    }
  }
}

async function load() {
  const [{ db }, { appRouter }] = await Promise.all([
    import('@findsports_oficial/db'),
    import('./index')
  ])
  return { db, appRouter }
}

/** Cria dono + bar ativo + assinatura e devolve o que o teste precisa limpar. */
async function seedBar(
  plan: Plan,
  status: Status,
  currentPeriodEnd: Date | null
) {
  const { db, appRouter } = await load()
  const ownerId = crypto.randomUUID()
  const fanId = crypto.randomUUID()
  const barId = crypto.randomUUID()

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
    name: 'Bar da oferta',
    address: 'Rua descartável, 1',
    neighborhood: 'Teste',
    city: 'Teste',
    latitude: '-23.55052000',
    longitude: '-46.63330800',
    isActive: true
  })
  await db
    .insert(subscription)
    .values({ barId, plan, status, currentPeriodEnd })

  return {
    db,
    barId,
    owner: appRouter.createCaller(contextFor(ownerId, 'pub')),
    fan: appRouter.createCaller(contextFor(fanId, 'fan')),
    fanId,
    cleanup: async () => {
      await db.delete(user).where(eq(user.id, ownerId))
      await db.delete(user).where(eq(user.id, fanId))
    }
  }
}

async function storedOffer(barId: string) {
  const { db } = await load()
  const [row] = await db
    .select({ houseOffer: bar.houseOffer })
    .from(bar)
    .where(eq(bar.id, barId))
  return row?.houseOffer ?? null
}

const inAMonth = () => new Date(Date.now() + 30 * 24 * 3_600_000)

async function storedAcceptsReservations(barId: string) {
  const { db } = await load()
  const [row] = await db
    .select({ acceptsReservations: bar.acceptsReservations })
    .from(bar)
    .where(eq(bar.id, barId))
  return row?.acceptsReservations
}

integrationTest(
  'dono de bar Elite salva, edita e limpa a oferta; o perfil acompanha',
  async () => {
    const ctx = await seedBar('elite', 'active', inAMonth())
    try {
      await ctx.owner.pub.updateAcceptsReservations({
        acceptsReservations: true
      })
      const saved = await ctx.owner.pub.updateHouseOffer({
        houseOffer: '  Chopp   em dobro\nno intervalo  '
      })
      expect(saved.houseOffer).toBe('Chopp em dobro no intervalo')
      expect((await ctx.fan.pubs.getById({ id: ctx.barId })).houseOffer).toBe(
        'Chopp em dobro no intervalo'
      )

      await ctx.owner.pub.updateHouseOffer({ houseOffer: 'Porção grátis' })
      expect((await ctx.fan.pubs.getById({ id: ctx.barId })).houseOffer).toBe(
        'Porção grátis'
      )

      const cleared = await ctx.owner.pub.updateHouseOffer({
        houseOffer: '   '
      })
      expect(cleared.houseOffer).toBeNull()
      expect(await storedOffer(ctx.barId)).toBeNull()
      expect(
        (await ctx.fan.pubs.getById({ id: ctx.barId })).houseOffer
      ).toBeNull()

      await ctx.owner.pub.updateHouseOffer({ houseOffer: 'Volta' })
      await ctx.owner.pub.updateHouseOffer({ houseOffer: null })
      expect(await storedOffer(ctx.barId)).toBeNull()
    } finally {
      await ctx.cleanup()
    }
  }
)

for (const plan of ['starter', 'pro'] as const) {
  integrationTest(
    `dono de bar ${plan} recebe recusa do servidor ao chamar o procedimento`,
    async () => {
      const ctx = await seedBar(plan, 'active', inAMonth())
      try {
        await expect(
          ctx.owner.pub.updateHouseOffer({ houseOffer: 'Chopp em dobro' })
        ).rejects.toMatchObject({ code: 'FORBIDDEN' })
        expect(await storedOffer(ctx.barId)).toBeNull()
      } finally {
        await ctx.cleanup()
      }
    }
  )
}

integrationTest('Elite em past_due não configura', async () => {
  const ctx = await seedBar('elite', 'past_due', inAMonth())
  try {
    await expect(
      ctx.owner.pub.updateHouseOffer({ houseOffer: 'Chopp em dobro' })
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  } finally {
    await ctx.cleanup()
  }
})

integrationTest('assinatura Elite em trialing configura', async () => {
  const ctx = await seedBar('elite', 'trialing', inAMonth())
  try {
    await ctx.owner.pub.updateAcceptsReservations({ acceptsReservations: true })
    const saved = await ctx.owner.pub.updateHouseOffer({
      houseOffer: 'Chopp em dobro'
    })
    expect(saved.houseOffer).toBe('Chopp em dobro')
    expect((await ctx.fan.pubs.getById({ id: ctx.barId })).houseOffer).toBe(
      'Chopp em dobro'
    )
  } finally {
    await ctx.cleanup()
  }
})

integrationTest('torcedor não configura oferta', async () => {
  const ctx = await seedBar('elite', 'active', inAMonth())
  try {
    await expect(
      ctx.fan.pub.updateHouseOffer({ houseOffer: 'Chopp em dobro' })
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  } finally {
    await ctx.cleanup()
  }
})

integrationTest(
  'texto acima do limite é recusado e nada é gravado',
  async () => {
    const ctx = await seedBar('elite', 'active', inAMonth())
    try {
      await expect(
        ctx.owner.pub.updateHouseOffer({
          houseOffer: 'a'.repeat(HOUSE_OFFER_MAX_LENGTH + 1)
        })
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
      expect(await storedOffer(ctx.barId)).toBeNull()
    } finally {
      await ctx.cleanup()
    }
  }
)

integrationTest(
  'o banco recusa oferta vazia ou longa gravada por fora',
  async () => {
    const ctx = await seedBar('elite', 'active', inAMonth())
    try {
      // O builder do Drizzle é thenable, não Promise: `rejects` precisa de uma.
      const write = (houseOffer: string) =>
        (async () => {
          await ctx.db
            .update(bar)
            .set({ houseOffer })
            .where(eq(bar.id, ctx.barId))
        })()

      await expect(write('')).rejects.toThrow()
      await expect(
        write('a'.repeat(HOUSE_OFFER_MAX_LENGTH + 1))
      ).rejects.toThrow()
      expect(await storedOffer(ctx.barId)).toBeNull()
    } finally {
      await ctx.cleanup()
    }
  }
)

integrationTest(
  'downgrade esconde a oferta do perfil, preserva o texto e não mexe na reserva',
  async () => {
    const ctx = await seedBar('elite', 'active', inAMonth())
    const sportId = crypto.randomUUID()
    try {
      await ctx.owner.pub.updateAcceptsReservations({
        acceptsReservations: true
      })
      await ctx.owner.pub.updateHouseOffer({ houseOffer: 'Chopp em dobro' })

      // Reserva criada enquanto a oferta valia, com a cópia congelada.
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
          offerSnapshot: 'Chopp em dobro'
        })
        .returning({ id: reservation.id })
      if (!createdReservation) throw new Error('reserva não criada')

      await ctx.db
        .update(subscription)
        .set({ plan: 'pro' })
        .where(eq(subscription.barId, ctx.barId))

      expect(
        (await ctx.fan.pubs.getById({ id: ctx.barId })).houseOffer
      ).toBeNull()
      expect(await storedOffer(ctx.barId)).toBe('Chopp em dobro')
      // O dono continua lendo o próprio texto no painel.
      expect((await ctx.owner.pub.getMe()).houseOffer).toBe('Chopp em dobro')
      // Sem Elite, nem limpar passa.
      await expect(
        ctx.owner.pub.updateHouseOffer({ houseOffer: null })
      ).rejects.toMatchObject({ code: 'FORBIDDEN' })

      // Plano de volta: o mesmo texto reaparece, e mudar a oferta não
      // reescreve a cópia da reserva.
      await ctx.db
        .update(subscription)
        .set({ plan: 'elite' })
        .where(eq(subscription.barId, ctx.barId))
      expect((await ctx.fan.pubs.getById({ id: ctx.barId })).houseOffer).toBe(
        'Chopp em dobro'
      )
      await ctx.owner.pub.updateHouseOffer({ houseOffer: 'Porção grátis' })

      const [frozen] = await ctx.db
        .select({ offerSnapshot: reservation.offerSnapshot })
        .from(reservation)
        .where(eq(reservation.id, createdReservation.id))
      expect(frozen?.offerSnapshot).toBe('Chopp em dobro')
    } finally {
      await ctx.cleanup()
      await ctx.db.delete(sport).where(eq(sport.id, sportId))
    }
  }
)

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
