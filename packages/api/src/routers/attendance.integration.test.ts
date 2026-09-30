import { expect, test } from 'bun:test'
import { eq, inArray } from '@findsports_oficial/db'
import { generateReservationCode } from '@findsports_oficial/db/reservation-code'
import {
  attendance,
  attendanceReport
} from '@findsports_oficial/db/schema/attendance'
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
import {
  ATTENDANCE_DISPLAY_FLOOR,
  ATTENDANCE_REPORT_WINDOW_DAYS,
  UNREGISTERED_ALERT_MIN_GAMES
} from '../lib/attendance'
import { contextFor, load, refusal } from './integration-seed'

/**
 * "Vou assistir aqui" (WEB-127) contra o banco de verdade: unicidade pela
 * chave, reserva que marca presença, piso de exibição e o sinal do bar sem
 * número absoluto.
 */

const integrationTest = isDisposableTestDatabase() ? test : test.skip

type Role = 'pub' | 'fan' | 'admin'

const HOUR = 3_600_000
const DAY = 24 * HOUR

/** `offsets` em ms a partir de agora; o padrão é um jogo futuro e um ao vivo. */
async function seed(
  options: { elite?: boolean; fans?: number; offsets?: number[] } = {}
) {
  const { db, appRouter } = await load()
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
    /**
     * Reserva confirmada com presença, como a API deixaria. `registered`
     * grava um uso do código: a fonte do bar.
     */
    reserve: async (
      eventId: string,
      userId: string,
      options: { offer?: string; registered?: boolean } = {}
    ) => {
      const [created] = await db
        .insert(reservation)
        .values({
          eventId,
          userId,
          partySize: 1,
          status: 'confirmed',
          offerSnapshot: options.offer ?? null
        })
        .returning({ id: reservation.id })
      const [code] = await db
        .insert(reservationCode)
        .values({
          code: generateReservationCode(),
          reservationId: created?.id as string,
          maxUses: 1
        })
        .returning({ id: reservationCode.id })
      await db.insert(attendance).values({ userId, eventId })
      if (options.registered) {
        await db
          .insert(reservationCodeUse)
          .values({ codeId: code?.id as string })
      }
      return code?.id as string
    },
    presences: (eventId: string) =>
      db.select().from(attendance).where(eq(attendance.eventId, eventId)),
    cleanup: async () => {
      await db.delete(user).where(inArray(user.id, [ownerId, ...fanIds]))
      await db.delete(sport).where(eq(sport.id, sportId))
    }
  }
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

      expect(
        (await refusal(api.set({ eventId: past, attending: true }))).code
      ).toBe('PRECONDITION_FAILED')
      expect(
        (
          await refusal(
            ctx.owner.attendance.set({ eventId: future, attending: true })
          )
        ).code
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

integrationTest(
  'pergunta pós-jogo: brinde só com oferta congelada, e as fontes ficam separadas',
  async () => {
    const ctx = await seed({
      elite: true,
      fans: 3,
      offsets: [DAY, -DAY, -(ATTENDANCE_REPORT_WINDOW_DAYS + 1) * DAY]
    })
    const [future, ended, stale] = ctx.gameIds as [string, string, string]
    const [withOffer, presenceOnly, noOffer] = ctx.fanIds as [
      string,
      string,
      string
    ]
    try {
      const codeId = await ctx.reserve(ended, withOffer, {
        offer: 'Chopp em dobro',
        registered: true
      })
      await ctx.reserve(ended, noOffer)
      await ctx.attend(ended, [presenceOnly])
      // Jogo futuro e jogo fora da janela não perguntam nada.
      await ctx.attend(future, [presenceOnly])
      await ctx.attend(stale, [presenceOnly])

      const offerOf = async (index: number) =>
        (await ctx.fan(index).attendance.pendingReports()).map(
          ({ eventId, offer }) => ({ eventId, offer })
        )
      expect(await offerOf(0)).toEqual([
        { eventId: ended, offer: 'Chopp em dobro' }
      ])
      expect(await offerOf(1)).toEqual([{ eventId: ended, offer: null }])
      expect(await offerOf(2)).toEqual([{ eventId: ended, offer: null }])

      // Pergunta que não foi feita não grava resposta.
      expect(
        await ctx.fan(1).attendance.report({
          eventId: ended,
          attended: true,
          offerReceived: true
        })
      ).toEqual({ attended: true, offerReceived: null })
      expect(
        await ctx.fan(0).attendance.report({
          eventId: ended,
          attended: false,
          offerReceived: true
        })
      ).toEqual({ attended: false, offerReceived: null })
      // Corrigir troca a resposta, sem somar outra.
      await ctx.fan(0).attendance.report({
        eventId: ended,
        attended: true,
        offerReceived: false
      })
      const reports = await ctx.db
        .select()
        .from(attendanceReport)
        .where(eq(attendanceReport.eventId, ended))
      expect(
        reports.find((row) => row.userId === withOffer)?.offerReceived
      ).toBe(false)
      expect(reports).toHaveLength(2)
      expect(await ctx.fan(0).attendance.pendingReports()).toEqual([])

      // "Não fui" do torcedor não desfaz o registro do bar.
      const [code] = await ctx.db
        .select({ usedCount: reservationCode.usedCount })
        .from(reservationCode)
        .where(eq(reservationCode.id, codeId))
      expect(code?.usedCount).toBe(1)

      expect(
        (
          await refusal(
            ctx.fan(1).attendance.report({ eventId: future, attended: true })
          )
        ).code
      ).toBe('NOT_FOUND')
      expect(
        (
          await refusal(
            ctx.fan(1).attendance.report({ eventId: stale, attended: true })
          )
        ).code
      ).toBe('NOT_FOUND')
      expect((await refusal(ctx.owner.attendance.pendingReports())).code).toBe(
        'FORBIDDEN'
      )
    } finally {
      await ctx.cleanup()
    }
  }
)

integrationTest(
  'alerta interno só com "foi, mas o bar não registrou" repetido',
  async () => {
    const offsets = Array.from(
      { length: UNREGISTERED_ALERT_MIN_GAMES },
      (_, i) => -(i + 2) * DAY
    )
    // Encerrado há uma hora: a janela de validação ainda está aberta.
    const ctx = await seed({
      elite: true,
      fans: 2,
      offsets: [...offsets, -4 * HOUR]
    })
    const games = ctx.gameIds.slice(0, UNREGISTERED_ALERT_MIN_GAMES)
    const [recent] = ctx.gameIds.slice(UNREGISTERED_ALERT_MIN_GAMES)
    const [fan, other] = ctx.fanIds as [string, string]
    const admin = (await import('./index')).appRouter.createCaller(
      contextFor(crypto.randomUUID(), 'admin')
    ).attendance
    const alertFor = async () =>
      (await admin.unregisteredAlerts()).find(
        ({ barId }) => barId === ctx.barId
      )
    const said = (eventId: string, userId: string, attended: boolean) =>
      ctx.db.insert(attendanceReport).values({ eventId, userId, attended })
    try {
      for (const game of games.slice(0, -1)) {
        await ctx.reserve(game, fan)
        await said(game, fan, true)
      }
      await ctx.reserve(recent as string, fan)
      await said(recent as string, fan, true)
      await ctx.reserve(games[0] as string, other, { registered: true })
      await said(games[0] as string, other, false)
      expect(await alertFor()).toBeUndefined()

      const last = games.at(-1) as string
      await ctx.reserve(last, fan)
      await said(last, fan, true)
      expect(await alertFor()).toEqual({
        barId: ctx.barId,
        barName: 'Bar da presença',
        unregisteredGames: UNREGISTERED_ALERT_MIN_GAMES,
        bothRegistered: 0,
        unregistered: UNREGISTERED_ALERT_MIN_GAMES,
        burned: 1,
        noShow: 0
      })

      expect(
        (await refusal(ctx.owner.attendance.unregisteredAlerts())).code
      ).toBe('FORBIDDEN')
    } finally {
      await ctx.cleanup()
    }
  }
)
