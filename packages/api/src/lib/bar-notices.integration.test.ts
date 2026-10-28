import { expect, test } from 'bun:test'
import { and, eq, inArray } from '@findsports_oficial/db'
import { attendance } from '@findsports_oficial/db/schema/attendance'
import { user } from '@findsports_oficial/db/schema/auth'
import { bar, barNotice } from '@findsports_oficial/db/schema/platform'
import { isDisposableTestDatabase } from '@findsports_oficial/db/utils/db-resolver'
import {
  type EmailApiBody,
  fakeEmailApi,
  inAMonth,
  seedBar
} from '../routers/integration-seed'
import { GAME_FILLING_THRESHOLD, sendWeeklyBarNotices } from './bar-notices'

/**
 * Avisos por e-mail do bar (WEB-441) contra o banco de verdade: preferências
 * gravadas, jogo lotando uma vez por jogo e os avisos da segunda sem repetir.
 */

const integrationTest = isDisposableTestDatabase() ? test : test.skip

/** Torcedores descartáveis, para encher um jogo. */
async function seedFans(
  db: Awaited<ReturnType<typeof seedBar>>['db'],
  count: number
) {
  const ids = Array.from({ length: count }, () => crypto.randomUUID())
  await db.insert(user).values(
    ids.map((id) => ({
      id,
      name: `Torcedor ${id.slice(0, 4)}`,
      email: `${id}@integration.invalid`,
      emailVerified: true,
      role: 'fan' as const,
      onboardingCompleted: true
    }))
  )
  return ids
}

const to = (sent: EmailApiBody[], email: string) =>
  sent.filter((body) => body.to.includes(email))

async function until(check: () => boolean) {
  for (let i = 0; i < 50 && !check(); i++) await Bun.sleep(20)
}

integrationTest('o dono liga e desliga cada aviso', async () => {
  const ctx = await seedBar('starter', 'active', inAMonth())
  try {
    const before = await ctx.owner.pub.getMe()
    expect(before.noticeWeeklySummary).toBe(true)
    expect(before.noticeGameFilling).toBe(true)
    expect(before.noticeEmptySchedule).toBe(false)

    expect(await ctx.owner.pub.updateNotices({ emptySchedule: true })).toEqual({
      noticeWeeklySummary: true,
      noticeGameFilling: true,
      noticeEmptySchedule: true
    })
    await ctx.owner.pub.updateNotices({ weeklySummary: false })
    const after = await ctx.owner.pub.getMe()
    expect(after.noticeWeeklySummary).toBe(false)
    expect(after.noticeEmptySchedule).toBe(true)

    await expect(ctx.owner.pub.updateNotices({})).rejects.toThrow()
    await expect(
      ctx.fan.pub.updateNotices({ weeklySummary: false })
    ).rejects.toThrow()
  } finally {
    await ctx.cleanup()
  }
})

integrationTest(
  `jogo lotando: a marcação que passa de ${GAME_FILLING_THRESHOLD} avisa uma vez`,
  async () => {
    const cleanups: (() => unknown)[] = []
    const sent = fakeEmailApi(cleanups)
    const ctx = await seedBar('starter', 'active', inAMonth())
    const ownerEmail = `${ctx.ownerId}@integration.invalid`
    const fans = await seedFans(ctx.db, GAME_FILLING_THRESHOLD + 1)
    try {
      const gameId = await ctx.seedGame({ participantFreeText: 'Final' })
      await ctx.db
        .insert(attendance)
        .values(
          fans
            .slice(0, GAME_FILLING_THRESHOLD - 1)
            .map((userId) => ({ userId, eventId: gameId }))
        )

      // A vigésima marcação não passa do limite.
      await ctx.fan.attendance.set({ eventId: gameId, attending: true })
      await Bun.sleep(200)
      expect(to(sent, ownerEmail)).toHaveLength(0)

      // A vigésima primeira passa. O e-mail sai depois da resposta.
      const [last, extra] = fans.slice(GAME_FILLING_THRESHOLD - 1)
      await ctx.db
        .insert(attendance)
        .values({ userId: last as string, eventId: gameId })
      await ctx.fan.attendance.set({ eventId: gameId, attending: false })
      await ctx.fan.attendance.set({ eventId: gameId, attending: true })
      await until(() => to(sent, ownerEmail).length > 0)
      expect(to(sent, ownerEmail).map((body) => body.subject)).toEqual([
        'Jogo lotando: Final'
      ])

      // Mais gente marcando não repete.
      await ctx.db
        .insert(attendance)
        .values({ userId: extra as string, eventId: gameId })
      await ctx.fan.attendance.set({ eventId: gameId, attending: false })
      await ctx.fan.attendance.set({ eventId: gameId, attending: true })
      await Bun.sleep(200)
      expect(to(sent, ownerEmail)).toHaveLength(1)
    } finally {
      await ctx.db.delete(user).where(inArray(user.id, fans))
      await ctx.cleanup()
      for (const cleanup of cleanups) await cleanup()
    }
  }
)

integrationTest('jogo lotando desligado: nada sai', async () => {
  const cleanups: (() => unknown)[] = []
  const sent = fakeEmailApi(cleanups)
  const ctx = await seedBar('elite', 'active', inAMonth(), {
    noticeGameFilling: false
  })
  const fans = await seedFans(ctx.db, GAME_FILLING_THRESHOLD)
  try {
    const gameId = await ctx.seedGame()
    await ctx.db
      .insert(attendance)
      .values(fans.map((userId) => ({ userId, eventId: gameId })))
    await ctx.fan.attendance.set({ eventId: gameId, attending: true })
    await Bun.sleep(200)
    expect(to(sent, `${ctx.ownerId}@integration.invalid`)).toHaveLength(0)
  } finally {
    await ctx.db.delete(user).where(inArray(user.id, fans))
    await ctx.cleanup()
    for (const cleanup of cleanups) await cleanup()
  }
})

// Segunda, 01:00 de Brasília: a hora do cron.
const MONDAY = new Date('2027-03-01T04:00:00Z')
const LAST_WEEK = new Date('2027-02-24T23:00:00Z')
const THIS_WEEK = new Date('2027-03-03T23:30:00Z')

integrationTest(
  'segunda: resumo para quem liga, grade vazia sem resumo, uma vez por semana',
  async () => {
    const cleanups: (() => unknown)[] = []
    const sent = fakeEmailApi(cleanups)
    const elite = await seedBar('elite', 'active', inAMonth())
    const quiet = await seedBar('starter', 'active', inAMonth(), {
      noticeWeeklySummary: false,
      noticeEmptySchedule: true
    })
    const silent = await seedBar('starter', 'active', inAMonth(), {
      noticeWeeklySummary: false
    })
    const email = (ctx: { ownerId: string }) =>
      `${ctx.ownerId}@integration.invalid`
    try {
      const played = await elite.seedGame({ startsAt: LAST_WEEK })
      await elite.db
        .insert(attendance)
        .values({ userId: elite.fanId, eventId: played })
      await elite.seedGame({
        startsAt: THIS_WEEK,
        participantFreeText: 'Clássico'
      })
      // Rascunho não conta como jogo na agenda.
      await quiet.seedGame({ startsAt: THIS_WEEK, publishedAt: null })

      // Fora da segunda, nada.
      expect(
        await sendWeeklyBarNotices(new Date('2027-03-02T04:00:00Z'))
      ).toEqual({ weeklySummaries: 0, emptySchedules: 0 })
      expect(to(sent, email(elite))).toHaveLength(0)

      const first = await sendWeeklyBarNotices(MONDAY)
      expect(first.weeklySummaries).toBeGreaterThanOrEqual(1)
      expect(first.emptySchedules).toBeGreaterThanOrEqual(1)

      const [summary] = to(sent, email(elite))
      expect(summary?.subject).toBe('Resumo da semana: Bar de integração')
      expect(summary?.text).toContain(
        'Veja como foi a semana de 22/02 a 28/02 na Onside'
      )
      expect(summary?.text).toContain('1 pessoa marcou que ia aos seus jogos')
      expect(summary?.text).toContain('0 códigos validados no balcão')
      // O campeonato vem do banco para o detalhe do jogo (WEB-477).
      expect(summary?.text).toContain(
        'NESTA SEMANA · DE 01/03 A 07/03\nQUA 03/03 · Clássico · 20:30 · Campeonato de integração'
      )
      expect(to(sent, email(quiet)).map((body) => body.subject)).toEqual([
        'Nenhum jogo na agenda desta semana'
      ])
      expect(to(sent, email(silent))).toHaveLength(0)

      // O cron de novo na mesma segunda não repete.
      await sendWeeklyBarNotices(MONDAY)
      expect(to(sent, email(elite))).toHaveLength(1)
      expect(to(sent, email(quiet))).toHaveLength(1)
    } finally {
      await elite.cleanup()
      await quiet.cleanup()
      await silent.cleanup()
      for (const cleanup of cleanups) await cleanup()
    }
  }
)

integrationTest(
  'envio recusado: a falha sobe e o aviso fica para a próxima rodada',
  async () => {
    const cleanups: (() => unknown)[] = []
    fakeEmailApi(cleanups, 500)
    // Os outros bares do banco também recebem e também falham: o que importa
    // aqui é o deste.
    const ctx = await seedBar('starter', 'active', inAMonth())
    const monday = new Date('2027-03-08T04:00:00Z')
    try {
      await expect(sendWeeklyBarNotices(monday)).rejects.toThrow(
        /não (saiu|saíram)/
      )
      const rows = await ctx.db
        .select()
        .from(barNotice)
        .where(
          and(eq(barNotice.barId, ctx.barId), eq(barNotice.ref, '2027-03-08'))
        )
      expect(rows).toHaveLength(0)
    } finally {
      await ctx.cleanup()
      for (const cleanup of cleanups) await cleanup()
    }
  }
)

// O bar desligado do ar não recebe nada.
integrationTest('bar fora do ar fica de fora', async () => {
  const cleanups: (() => unknown)[] = []
  const sent = fakeEmailApi(cleanups)
  const ctx = await seedBar('starter', 'active', inAMonth(), {
    isActive: false
  })
  try {
    await sendWeeklyBarNotices(new Date('2027-03-15T04:00:00Z'))
    expect(to(sent, `${ctx.ownerId}@integration.invalid`)).toHaveLength(0)
    const [row] = await ctx.db
      .select({ isActive: bar.isActive })
      .from(bar)
      .where(eq(bar.id, ctx.barId))
    expect(row?.isActive).toBe(false)
  } finally {
    await ctx.cleanup()
    for (const cleanup of cleanups) await cleanup()
  }
})
