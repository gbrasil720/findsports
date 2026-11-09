import { expect, test } from 'bun:test'
import { inArray } from '@findsports_oficial/db'
import {
  attendance,
  attendanceCheckin
} from '@findsports_oficial/db/schema/attendance'
import { user } from '@findsports_oficial/db/schema/auth'
import { bar } from '@findsports_oficial/db/schema/platform'
import { barRating } from '@findsports_oficial/db/schema/rating'
import { friendship } from '@findsports_oficial/db/schema/social'
import { isDisposableTestDatabase } from '@findsports_oficial/db/utils/db-resolver'
import { contextFor, load, refusal, seedBar } from './integration-seed'

/**
 * A página pública do bar (`/bar/<slug>-<prefixo>`): o que sai sem sessão
 * (`lib/public-bar-page.ts`) e o que só a sessão recebe (`pubs.pageViewer`).
 */

const integrationTest = isDisposableTestDatabase() ? test : test.skip

const lib = () => import('../lib/public-bar-page')

integrationTest(
  'sem sessão: o bar no ar, sem rascunho, sem amigo e sem presença de ninguém',
  async () => {
    const ctx = await seedBar('elite', 'active', null, {
      name: 'Bar do Zé',
      neighborhood: 'Vila Madalena',
      houseOffer: 'Chopp em dobro'
    })
    try {
      const { readPublicBarPage, resolveBarRef } = await lib()
      const gameId = await ctx.seedGame()
      const draftId = await ctx.seedGame({ publishedAt: null })
      await ctx.fan.attendance.set({ eventId: gameId, attending: true })

      expect(await resolveBarRef(ctx.barId.slice(0, 8))).toBe(ctx.barId)

      const page = await readPublicBarPage(ctx.barId)
      if (page?.kind !== 'live') throw new Error('esperava o bar no ar')
      expect(page.ownerPreview).toBe(false)
      expect(page.path).toBe(
        `/bar/bar-do-ze-vila-madalena-${ctx.barId.slice(0, 8)}`
      )
      const ids = page.bar.events.map((game) => game.id)
      expect(ids).toContain(gameId)
      expect(ids).not.toContain(draftId)
      const game = page.bar.events.find((g) => g.id === gameId)
      // Uma presença: abaixo do piso, sem número.
      expect(game?.going).toBeNull()
      expect(game?.houseOffer).toBe('Chopp em dobro')
      expect(page.bar.issuesCode).toBe(true)
      // Nada da sessão nem do dono na leitura pública.
      const json = JSON.stringify(page)
      for (const key of ['attending', 'friends', 'code', 'userId'])
        expect(json).not.toContain(`"${key}"`)
    } finally {
      await ctx.cleanup()
    }
  }
)

integrationTest(
  'fora do ar: só o nome para quem visita; o dono continua na prévia',
  async () => {
    const ctx = await seedBar('pro', 'active', null, { isActive: false })
    try {
      const { readPublicBarPage } = await lib()
      const visitor = await readPublicBarPage(ctx.barId)
      expect(visitor).toEqual({
        kind: 'off_air',
        id: ctx.barId,
        name: 'Bar de integração',
        path: `/bar/bar-de-integracao-teste-${ctx.barId.slice(0, 8)}`
      })
      const fan = await readPublicBarPage(ctx.barId, { viewerId: ctx.fanId })
      expect(fan?.kind).toBe('off_air')
      const owner = await readPublicBarPage(ctx.barId, {
        viewerId: ctx.ownerId
      })
      expect(owner?.kind === 'live' && owner.ownerPreview).toBe(true)
      expect(await readPublicBarPage(crypto.randomUUID())).toBeNull()
    } finally {
      await ctx.cleanup()
    }
  }
)

integrationTest('prefixo que bate em dois bares não resolve', async () => {
  const ctx = await seedBar('starter', 'active', null)
  const { resolveBarRef, listLiveBarPaths } = await lib()
  const prefix = ctx.barId.slice(0, 8)
  const otherOwner = crypto.randomUUID()
  try {
    expect(await resolveBarRef(prefix)).toBe(ctx.barId)
    await ctx.db.insert(user).values({
      id: otherOwner,
      name: 'Outro dono',
      email: `${otherOwner}@integration.invalid`,
      emailVerified: true,
      role: 'pub'
    })
    await ctx.db.insert(bar).values({
      id: `${prefix}-ffff-4fff-8fff-ffffffffffff`,
      userId: otherOwner,
      name: 'Outro bar',
      address: 'Rua descartável, 2',
      neighborhood: 'Teste',
      city: 'Teste',
      latitude: '-23.55052000',
      longitude: '-46.63330800',
      isActive: false
    })
    expect(await resolveBarRef(prefix)).toBeNull()
    const paths = (await listLiveBarPaths()).map((entry) => entry.path)
    expect(paths.some((path) => path.endsWith(prefix))).toBe(false)
    expect(await resolveBarRef('nao-e-hex')).toBeNull()
  } finally {
    await ctx.db.delete(user).where(inArray(user.id, [otherOwner]))
    await ctx.cleanup()
  }
})

integrationTest(
  'nota, estrelas, "O que pesou?" e comentários só com 5 verificadas; comentário só aprovado',
  async () => {
    const ctx = await seedBar('pro', 'active', null)
    const { setAppConfig, resetAppConfig } = await import('../lib/app-config')
    const raters = Array.from({ length: 6 }, () => crypto.randomUUID())
    await ctx.db.insert(user).values(
      raters.map((id, index) => ({
        id,
        name: `Avaliador ${index}`,
        email: `${id}@integration.invalid`,
        emailVerified: true,
        role: 'fan' as const
      }))
    )
    try {
      await setAppConfig('rating.public_display', true, null)
      const { readPublicBarPage } = await lib()
      const gameId = await ctx.seedGame({
        startsAt: new Date(Date.now() - 48 * 3_600_000),
        participantFreeText: 'Jogo avaliado'
      })
      // Verificada é quem fez check-in (ou teve o código validado): o banco
      // decide pelo trigger, na gravação da avaliação.
      const verify = (id: string) =>
        ctx.db.insert(attendanceCheckin).values({
          userId: id,
          eventId: gameId,
          latitude: -23.55,
          longitude: -46.63,
          distanceM: 10
        })
      const rate = (
        id: string,
        fields: Partial<typeof barRating.$inferInsert> = {}
      ) =>
        ctx.db.insert(barRating).values({
          barId: ctx.barId,
          actorUserId: id,
          eventId: gameId,
          wouldReturn: true,
          stars: 5,
          ...fields
        })
      const page = async () => {
        const read = await readPublicBarPage(ctx.barId)
        if (read?.kind !== 'live') throw new Error('esperava o bar no ar')
        return read.bar
      }
      const [a, b, c, d, e, stranger] = raters as [
        string,
        string,
        string,
        string,
        string,
        string
      ]
      for (const id of [a, b, c, d]) await verify(id)
      await rate(a, {
        reasons: ['sound', 'screen'],
        comment: 'Som alto e telão de qualquer mesa.',
        commentReview: 'approved',
        identified: true
      })
      await rate(b, { reasons: ['sound'], stars: 4 })
      await rate(c, {
        wouldReturn: false,
        reasons: ['crowded'],
        stars: 3,
        comment: 'Ainda em revisão.',
        commentReview: 'pending'
      })
      await rate(d, {
        stars: 4,
        comment: 'Anônimo.',
        commentReview: 'approved'
      })
      // Não verificada: não conta para o piso nem aparece.
      await rate(stranger, {
        wouldReturn: false,
        reasons: ['price'],
        stars: 1,
        comment: 'Nunca fui.',
        commentReview: 'approved'
      })

      // Quatro verificadas, abaixo do piso de 5: nada da nota.
      const below = await page()
      expect(below.rating).toBeNull()
      expect(below.ratingReasons).toBeNull()
      expect(below.reviews).toEqual([])

      await verify(e)
      await rate(e, { stars: 5, reasons: ['screen'] })
      const above = await page()
      expect(above.rating).toEqual({
        total: 5,
        percentage: 80,
        stars: 4.2,
        starsCount: 5
      })
      // Só das verificadas, sem contagem: "price" da não verificada fica fora.
      expect(above.ratingReasons).toEqual({
        positive: ['sound', 'screen'],
        negative: ['crowded']
      })
      // Só comentário aprovado de verificada; nome só de quem quis.
      expect(
        above.reviews.map(({ comment, name, game }) => ({
          comment,
          name,
          game
        }))
      ).toEqual([
        { comment: 'Anônimo.', name: null, game: 'Jogo avaliado' },
        {
          comment: 'Som alto e telão de qualquer mesa.',
          name: 'Avaliador 0',
          game: 'Jogo avaliado'
        }
      ])
    } finally {
      await resetAppConfig('rating.public_display')
      await ctx.cleanup()
      await ctx.db.delete(user).where(inArray(user.id, raters))
    }
  }
)

integrationTest(
  'pageViewer: só com sessão; amigo aceito que deixa ver é nomeado, estranho não',
  async () => {
    const ctx = await seedBar('elite', 'active', null)
    const { appRouter } = await load()
    const friendId = crypto.randomUUID()
    const hiddenId = crypto.randomUUID()
    const strangerId = crypto.randomUUID()
    await ctx.db.insert(user).values(
      [
        [friendId, 'Marina', 'friends'],
        [hiddenId, 'Escondida', 'nobody'],
        [strangerId, 'Estranho', 'everyone']
      ].map(([id, name, activityVisibility]) => ({
        id: id ?? '',
        name: name ?? '',
        email: `${id}@integration.invalid`,
        emailVerified: true,
        role: 'fan' as const,
        activityVisibility: activityVisibility as 'friends'
      }))
    )
    try {
      const gameId = await ctx.seedGame()
      const now = new Date()
      await ctx.db.insert(friendship).values([
        {
          requesterId: ctx.fanId,
          addresseeId: friendId,
          via: 'code',
          acceptedAt: now
        },
        {
          requesterId: hiddenId,
          addresseeId: ctx.fanId,
          via: 'code',
          acceptedAt: now
        }
      ])
      await ctx.db.insert(attendance).values(
        [friendId, hiddenId, strangerId].map((userId) => ({
          userId,
          eventId: gameId
        }))
      )

      const anonymous = appRouter.createCaller({
        auth: null,
        session: null,
        clientIp: '127.0.0.1'
      })
      expect(
        (await refusal(anonymous.pubs.pageViewer({ barId: ctx.barId }))).code
      ).toBe('UNAUTHORIZED')

      const before = await ctx.fan.pubs.pageViewer({ barId: ctx.barId })
      expect(before.fan).toBe(true)
      expect(before.favorited).toBe(false)
      expect(before.games[gameId]?.friends).toEqual([
        { name: 'Marina', image: null }
      ])
      expect(before.games[gameId]?.attendance?.attending).toBe(false)

      await ctx.fan.attendance.set({ eventId: gameId, attending: true })
      await ctx.fan.pubs.favorite({ barId: ctx.barId })
      const after = await ctx.fan.pubs.pageViewer({ barId: ctx.barId })
      expect(after.favorited).toBe(true)
      expect(after.games[gameId]?.attendance?.attending).toBe(true)
      // Elite: o código do balcão sai na hora.
      expect(after.games[gameId]?.attendance?.code).toMatch(/^[A-Z0-9]{6}$/)

      const owner = appRouter.createCaller(contextFor(ctx.ownerId, 'pub'))
      expect(await owner.pubs.pageViewer({ barId: ctx.barId })).toEqual({
        fan: false,
        favorited: false,
        games: {}
      })
    } finally {
      await ctx.cleanup()
      await ctx.db
        .delete(user)
        .where(inArray(user.id, [friendId, hiddenId, strangerId]))
    }
  }
)
