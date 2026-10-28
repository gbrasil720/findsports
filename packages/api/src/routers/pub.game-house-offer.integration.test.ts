import { expect, test } from 'bun:test'
import { eq } from '@findsports_oficial/db'
import { HOUSE_OFFER_MAX_LENGTH } from '@findsports_oficial/db/house-offer'
import { event, sport } from '@findsports_oficial/db/schema/platform'
import { reservation } from '@findsports_oficial/db/schema/reservation'
import { isDisposableTestDatabase } from '@findsports_oficial/db/utils/db-resolver'
import { inAMonth, seedBar } from './integration-seed'

/**
 * Oferta da casa por jogo (WEB-422, WEB-464) contra o banco: a do jogo
 * substitui a padrão do bar, "sem oferta neste jogo" a desliga, o código do
 * balcão leva a deste jogo e não muda depois, e só o Elite configura.
 */

const integrationTest = isDisposableTestDatabase() ? test : test.skip

type Ctx = Awaited<ReturnType<typeof seedBar>>

const storedGame = async (ctx: Ctx, id: string) => {
  const [row] = await ctx.db
    .select({ houseOffer: event.houseOffer, noHouseOffer: event.noHouseOffer })
    .from(event)
    .where(eq(event.id, id))
  return row
}

/** Um esporte para o `createEvent`; sai no fim, depois dos jogos dele. */
async function withSport(ctx: Ctx) {
  const sportId = crypto.randomUUID()
  await ctx.db.insert(sport).values({
    id: sportId,
    name: `Esporte ${sportId}`,
    slug: `integration-${sportId}`
  })
  return {
    sportId,
    drop: async () => {
      await ctx.db.delete(event).where(eq(event.sportId, sportId))
      await ctx.db.delete(sport).where(eq(sport.id, sportId))
    }
  }
}

const novoJogo = (sportId: string) => ({
  sportId,
  championship: 'Campeonato de integração',
  startsAt: inAMonth().toISOString()
})

integrationTest(
  'Elite troca a oferta por jogo; a página e o código levam a deste jogo',
  async () => {
    const ctx = await seedBar('elite', 'active', inAMonth(), {
      houseOffer: 'Chopp em dobro'
    })
    try {
      const herda = await ctx.seedGame()
      const propria = await ctx.seedGame({ houseOffer: 'Porção grátis' })
      const sem = await ctx.seedGame({ noHouseOffer: true })

      const pagina = await ctx.fan.pubs.getById({ id: ctx.barId })
      const ofertaDe = (id: string) =>
        pagina.events.find((game) => game.id === id)?.houseOffer
      expect(ofertaDe(herda)).toBe('Chopp em dobro')
      expect(ofertaDe(propria)).toBe('Porção grátis')
      expect(ofertaDe(sem)).toBeNull()
      // A padrão continua no topo, para o app anterior.
      expect(pagina.houseOffer).toBe('Chopp em dobro')
      // O jogo não manda a coluna crua.
      expect(pagina.events[0]).not.toHaveProperty('noHouseOffer')

      const marcarPropria = await ctx.fan.attendance.set({
        eventId: propria,
        attending: true
      })
      expect(marcarPropria.offer).toBe('Porção grátis')
      const marcarSem = await ctx.fan.attendance.set({
        eventId: sem,
        attending: true
      })
      expect(marcarSem.code).not.toBeNull()
      expect(marcarSem.offer).toBeNull()

      // O dono troca depois: o código já emitido segura o que prometeu.
      await ctx.owner.pub.updateEvent({
        eventId: propria,
        houseOffer: 'Caipirinha pela metade'
      })
      await ctx.owner.pub.updateHouseOffer({ houseOffer: 'Outra coisa' })
      const [snapshot] = await ctx.db
        .select({ offer: reservation.offerSnapshot })
        .from(reservation)
        .where(eq(reservation.eventId, propria))
      expect(snapshot?.offer).toBe('Porção grátis')
      const depois = await ctx.fan.pubs.getById({ id: ctx.barId })
      expect(depois.events.find((g) => g.id === propria)?.houseOffer).toBe(
        'Caipirinha pela metade'
      )
      expect(depois.events.find((g) => g.id === herda)?.houseOffer).toBe(
        'Outra coisa'
      )
    } finally {
      await ctx.cleanup()
    }
  }
)

integrationTest(
  'createEvent e updateEvent gravam a oferta do jogo, normalizada',
  async () => {
    const ctx = await seedBar('elite', 'active', inAMonth(), {
      houseOffer: 'Chopp em dobro'
    })
    const { sportId, drop } = await withSport(ctx)
    try {
      await ctx.owner.pub.createEvent({
        ...novoJogo(sportId),
        houseOffer: '  Porção   grátis '
      })
      await ctx.owner.pub.createEvent({
        ...novoJogo(sportId),
        noHouseOffer: true
      })
      await ctx.owner.pub.createEvent(novoJogo(sportId))
      const jogos = await ctx.owner.pub.getMyEvents()
      expect(
        jogos.map(({ houseOffer, noHouseOffer }) => ({
          houseOffer,
          noHouseOffer
        }))
      ).toEqual(
        expect.arrayContaining([
          { houseOffer: 'Porção grátis', noHouseOffer: false },
          { houseOffer: null, noHouseOffer: true },
          { houseOffer: null, noHouseOffer: false }
        ])
      )

      const id = jogos.find((jogo) => jogo.houseOffer)?.id as string
      // "Sem oferta" apaga o texto; religar sem texto volta a herdar.
      await ctx.owner.pub.updateEvent({ eventId: id, noHouseOffer: true })
      expect(await storedGame(ctx, id)).toEqual({
        houseOffer: null,
        noHouseOffer: true
      })
      await ctx.owner.pub.updateEvent({ eventId: id, noHouseOffer: false })
      expect(await storedGame(ctx, id)).toEqual({
        houseOffer: null,
        noHouseOffer: false
      })
      // Religar não apaga o texto próprio que já existe.
      await ctx.owner.pub.updateEvent({ eventId: id, houseOffer: 'Própria' })
      await ctx.owner.pub.updateEvent({ eventId: id, noHouseOffer: false })
      expect(await storedGame(ctx, id)).toEqual({
        houseOffer: 'Própria',
        noHouseOffer: false
      })
      // Editar outra coisa não mexe na oferta.
      await ctx.owner.pub.updateEvent({ eventId: id, championship: 'Outro' })
      expect((await storedGame(ctx, id))?.houseOffer).toBe('Própria')

      await expect(
        ctx.owner.pub.updateEvent({
          eventId: id,
          houseOffer: 'a'.repeat(HOUSE_OFFER_MAX_LENGTH + 1)
        })
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
      expect((await storedGame(ctx, id))?.houseOffer).toBe('Própria')
    } finally {
      await drop()
      await ctx.cleanup()
    }
  }
)

for (const plan of ['starter', 'pro'] as const) {
  integrationTest(
    `bar ${plan} não configura a oferta do jogo, mas cria e edita o resto`,
    async () => {
      const ctx = await seedBar(plan, 'active', inAMonth())
      const { sportId, drop } = await withSport(ctx)
      try {
        await expect(
          ctx.owner.pub.createEvent({
            ...novoJogo(sportId),
            houseOffer: 'Chopp em dobro'
          })
        ).rejects.toMatchObject({ code: 'FORBIDDEN' })
        await ctx.owner.pub.createEvent(novoJogo(sportId))
        const [jogo] = await ctx.owner.pub.getMyEvents()
        if (!jogo) throw new Error('jogo não criado')
        expect(jogo.houseOffer).toBeNull()

        await expect(
          ctx.owner.pub.updateEvent({ eventId: jogo.id, noHouseOffer: true })
        ).rejects.toMatchObject({ code: 'FORBIDDEN' })
        expect(await storedGame(ctx, jogo.id)).toEqual({
          houseOffer: null,
          noHouseOffer: false
        })
        await ctx.owner.pub.updateEvent({
          eventId: jogo.id,
          championship: 'Outro nome'
        })
      } finally {
        await drop()
        await ctx.cleanup()
      }
    }
  )
}

integrationTest(
  'o banco recusa oferta do jogo vazia, longa ou com "sem oferta"',
  async () => {
    const ctx = await seedBar('elite', 'active', inAMonth())
    try {
      const id = await ctx.seedGame()
      const write = (fields: Partial<typeof event.$inferInsert>) =>
        (async () => {
          await ctx.db.update(event).set(fields).where(eq(event.id, id))
        })()
      await expect(write({ houseOffer: '' })).rejects.toThrow()
      await expect(
        write({ houseOffer: 'a'.repeat(HOUSE_OFFER_MAX_LENGTH + 1) })
      ).rejects.toThrow()
      await expect(
        write({ houseOffer: 'Chopp', noHouseOffer: true })
      ).rejects.toThrow()
      expect(await storedGame(ctx, id)).toEqual({
        houseOffer: null,
        noHouseOffer: false
      })
    } finally {
      await ctx.cleanup()
    }
  }
)
