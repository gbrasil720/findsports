import { afterEach, expect, spyOn, test } from 'bun:test'
import { eq, inArray } from '@findsports_oficial/db'
import { attendance } from '@findsports_oficial/db/schema/attendance'
import { rateLimit, user } from '@findsports_oficial/db/schema/auth'
import { event, userFavoriteBars } from '@findsports_oficial/db/schema/platform'
import { barRating } from '@findsports_oficial/db/schema/rating'
import { friendship } from '@findsports_oficial/db/schema/social'
import { isDisposableTestDatabase } from '@findsports_oficial/db/utils/db-resolver'
import { barData, dataExportLimitKey, fanData } from './account'
import {
  contextFor,
  fakeResend,
  load,
  type ResendBody,
  seedBar
} from './integration-seed'

/**
 * "Baixar meus dados" (11i e 2e, WEB-418): o arquivo vai de anexo para o
 * e-mail da conta, um pedido por dia, e traz a conta inteira de quem pede e
 * nada de outra pessoa além do nome e do `@` de quem é amigo. Nenhum e-mail
 * sai: a Resend é dublê.
 */
const integrationTest = isDisposableTestDatabase() ? test : test.skip

const cleanups: (() => Promise<unknown> | unknown)[] = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
})

/** O JSON anexado ao e-mail, como a Resend o recebe. */
function attached(email: ResendBody | undefined) {
  const [file] = email?.attachments ?? []
  expect(file?.content_type).toBe('application/json')
  expect(file?.filename).toMatch(/^onside-meus-dados-\d{4}-\d{2}-\d{2}\.json$/)
  return JSON.parse(Buffer.from(file?.content ?? '', 'base64').toString())
}

async function forgetLimit(userId: string) {
  const { db } = await load()
  await db
    .delete(rateLimit)
    .where(eq(rateLimit.key, dataExportLimitKey(userId)))
}

integrationTest('torcedor recebe os dados por e-mail', async () => {
  const sent = fakeResend(cleanups)
  const ctx = await seedBar('elite', 'active', null)
  const { db } = ctx
  const { appRouter } = await load()
  cleanups.push(() => forgetLimit(ctx.fanId))
  const tag = crypto.randomUUID().slice(0, 8)
  const friend = {
    id: crypto.randomUUID(),
    name: `Amiga ${tag}`,
    email: `amiga-${tag}@integration.invalid`,
    emailVerified: true,
    role: 'fan' as const,
    onboardingCompleted: true
  }
  try {
    await db.insert(user).values(friend)
    const past = await ctx.seedGame({
      startsAt: new Date(Date.now() - 2 * 86_400_000)
    })
    const me = ctx.fanId
    await db.insert(attendance).values([
      { userId: me, eventId: past },
      // A presença da amiga não é do torcedor: não sai no arquivo dele.
      { userId: friend.id, eventId: past }
    ])
    await db.insert(barRating).values({
      barId: ctx.barId,
      actorUserId: me,
      eventId: past,
      wouldReturn: true
    })
    await db.insert(userFavoriteBars).values({ userId: me, barId: ctx.barId })
    await db.insert(friendship).values({
      requesterId: friend.id,
      addresseeId: me,
      via: 'code',
      acceptedAt: new Date()
    })

    // O destinatário é o da sessão: campo a mais do cliente é descartado.
    const answer = await appRouter
      .createCaller(contextFor(me, 'fan'))
      .account.requestExport({
        ...({ to: 'outro@example.com' } as object)
      } as never)
    expect(answer).toEqual({ email: `${me}@integration.invalid` })
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({
      to: [`${me}@integration.invalid`],
      subject: 'Seus dados da Onside'
    })
    const data = attached(sent[0])
    expect(data.profile?.id).toBe(me)
    expect(data.profile?.email).toBe(`${me}@integration.invalid`)
    expect(data.favoriteBars.map((f: { bar: string }) => f.bar)).toEqual([
      'Bar de integração'
    ])
    expect(data.games).toHaveLength(1)
    expect(
      data.ratings.map((r: { wouldReturn: boolean }) => r.wouldReturn)
    ).toEqual([true])
    expect(data.friends).toEqual([
      expect.objectContaining({ name: friend.name, status: 'friends' })
    ])
    expect(data.achievements.level).toBeGreaterThanOrEqual(1)
    // Da amiga, só o nome: nem e-mail nem id.
    const wire = JSON.stringify(data)
    expect(wire).not.toContain(friend.email)
    expect(wire).not.toContain(friend.id)
    // Nem a presença da amiga no mesmo jogo.
    expect(data.games).toHaveLength(1)
  } finally {
    await db.delete(user).where(inArray(user.id, [friend.id]))
    await ctx.cleanup()
  }
})

integrationTest(
  'o arquivo traz todos os jogos, além dos 50 de Meus jogos',
  async () => {
    const ctx = await seedBar('pro', 'active', null)
    const { db } = ctx
    try {
      const first = await ctx.seedGame({
        startsAt: new Date(Date.now() - 86_400_000)
      })
      const [{ sportId } = { sportId: '' }] = await db
        .select({ sportId: event.sportId })
        .from(event)
        .where(eq(event.id, first))
      const more = await db
        .insert(event)
        .values(
          Array.from({ length: 50 }, (_, i) => ({
            barId: ctx.barId,
            sportId,
            championship: `Jogo ${i}`,
            startsAt: new Date(Date.now() - (i + 2) * 86_400_000)
          }))
        )
        .returning({ id: event.id })
      await db.insert(attendance).values(
        [first, ...more.map((m) => m.id)].map((eventId) => ({
          userId: ctx.fanId,
          eventId
        }))
      )

      expect(await ctx.fan.attendance.mine()).toHaveLength(50)
      expect((await fanData(ctx.fanId)).games).toHaveLength(51)
    } finally {
      await ctx.cleanup()
    }
  }
)

integrationTest('bar recebe a conta, o bar, o plano e os jogos', async () => {
  const sent = fakeResend(cleanups)
  const ctx = await seedBar('elite', 'active', null)
  cleanups.push(() => forgetLimit(ctx.ownerId))
  const { db } = ctx
  try {
    await ctx.seedGame({ startsAt: new Date(Date.now() + 86_400_000) })
    await db.insert(attendance).values({
      userId: ctx.fanId,
      eventId: await ctx.seedGame({
        startsAt: new Date(Date.now() - 86_400_000)
      })
    })

    await ctx.owner.account.requestExport()
    const data = attached(sent[0])
    expect(data).toEqual(
      JSON.parse(
        JSON.stringify({
          ...(await barData(ctx.ownerId)),
          exportedAt: data.exportedAt
        })
      )
    )
    expect(data.bar?.name).toBe('Bar de integração')
    expect(data.subscription?.plan).toBe('elite')
    expect(data.games).toHaveLength(2)
    // De torcedor, nada: nem quem marcou presença.
    expect(JSON.stringify(data)).not.toContain(ctx.fanId)
  } finally {
    await ctx.cleanup()
  }
})

integrationTest(
  'um pedido por dia: o segundo é recusado e não manda e-mail',
  async () => {
    const sent = fakeResend(cleanups)
    const ctx = await seedBar('pro', 'active', null)
    cleanups.push(ctx.cleanup, () => forgetLimit(ctx.fanId))

    await ctx.fan.account.requestExport()
    await expect(ctx.fan.account.requestExport()).rejects.toMatchObject({
      code: 'TOO_MANY_REQUESTS',
      message: expect.stringContaining('nas últimas 24 horas')
    })
    expect(sent).toHaveLength(1)
    // O limite é por conta: o dono do bar ainda pede o dele.
    cleanups.push(() => forgetLimit(ctx.ownerId))
    await ctx.owner.account.requestExport()
    expect(sent).toHaveLength(2)
  }
)

integrationTest('envio que falhou não gasta o pedido do dia', async () => {
  const error = spyOn(console, 'error').mockImplementation(() => {})
  cleanups.push(() => error.mockRestore())
  const ctx = await seedBar('pro', 'active', null)
  cleanups.push(ctx.cleanup, () => forgetLimit(ctx.fanId))

  fakeResend(cleanups, 500)
  await expect(ctx.fan.account.requestExport()).rejects.toMatchObject({
    code: 'INTERNAL_SERVER_ERROR'
  })
  for (const cleanup of cleanups.splice(0, 1)) await cleanup()

  const sent = fakeResend(cleanups)
  await ctx.fan.account.requestExport()
  expect(sent).toHaveLength(1)
})
