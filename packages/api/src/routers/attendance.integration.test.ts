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
import { monthStart } from '../lib/friends'
import { contextFor, load, type Role, refusal } from './integration-seed'

/**
 * "Vou assistir aqui" (WEB-127) contra o banco de verdade: unicidade pela
 * chave, reserva que marca presença, piso de exibição e o sinal do bar sem
 * número absoluto.
 */

const integrationTest = isDisposableTestDatabase() ? test : test.skip

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
    isActive: true
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
        startsAt: new Date(Date.now() + offset),
        acceptsReservations: options.elite ?? false
      }))
    )
    .returning({ id: event.id })

  const caller = (userId: string, role: Role) =>
    appRouter.createCaller(contextFor(userId, role))

  return {
    db,
    barId,
    sportId,
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
      expect(await api.set({ eventId: future, attending: true })).toEqual({
        attending: true,
        code: null,
        offer: null,
        confirmsCodesLater: false
      })
      await api.set({ eventId: future, attending: true })
      expect(await ctx.presences(future)).toHaveLength(1)

      const marked = await ctx.fan().pubs.getById({ id: ctx.barId })
      // Bar sem Elite: presença sem código.
      expect(marked.issuesCode).toBe(false)
      expect(marked.events.find(({ id }) => id === future)?.attendance).toEqual(
        { attending: true, count: null, code: null, validated: false }
      )

      // Jogo que já começou não oferece o botão.
      expect(marked.events.find(({ id }) => id === past)?.attendance).toBeNull()

      expect(await api.mine()).toMatchObject([
        { eventId: future, code: null, window: null, validated: false }
      ])
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
  'no bar Elite, marcar emite um código só; desmarcar aposenta, e código validado trava',
  async () => {
    const ctx = await seed({ elite: true })
    const [future] = ctx.gameIds as [string]
    const mine = async () =>
      (await ctx.fan().pubs.getById({ id: ctx.barId })).events.find(
        ({ id }) => id === future
      )?.attendance
    try {
      expect((await ctx.fan().pubs.getById({ id: ctx.barId })).issuesCode).toBe(
        true
      )
      const api = ctx.fan().attendance
      const first = await api.set({ eventId: future, attending: true })
      // Repetir devolve o mesmo código: a tela o mostra na hora.
      expect(await api.set({ eventId: future, attending: true })).toEqual(first)
      const marked = await mine()
      expect(marked?.attending).toBe(true)
      expect(marked?.code).toMatch(/^[A-Z0-9]{6}$/)
      expect(first).toMatchObject({ attending: true, code: marked?.code })
      const tickets = await ctx.db
        .select({
          status: reservation.status,
          partySize: reservation.partySize
        })
        .from(reservation)
        .where(eq(reservation.eventId, future))
      expect(tickets).toEqual([{ status: 'confirmed', partySize: 1 }])

      await api.set({ eventId: future, attending: false })
      expect(await mine()).toEqual({
        attending: false,
        count: null,
        code: null,
        validated: false
      })
      expect(await ctx.presences(future)).toHaveLength(0)

      // Marcar de novo emite outro código; validado, não desmarca mais.
      await api.set({ eventId: future, attending: true })
      const again = await mine()
      expect(again?.code).not.toBe(marked?.code)
      const [code] = await ctx.db
        .select({ id: reservationCode.id })
        .from(reservationCode)
        .where(eq(reservationCode.code, again?.code as string))
      await ctx.db
        .insert(reservationCodeUse)
        .values({ codeId: code?.id as string })
      expect((await mine())?.validated).toBe(true)
      // O bar Elite vê quem vai, pelo nome, e quem já validou.
      const [going] = await ctx.owner.barReservations.going()
      expect(going).toMatchObject({ id: future, validated: 1 })
      expect(going?.people).toMatchObject([{ name: 'Conta fan' }])
      expect(going?.people[0]?.validatedAt).toBeInstanceOf(Date)

      const [listed] = await ctx.fan().attendance.mine()
      expect(listed).toMatchObject({
        eventId: future,
        code: again?.code,
        validated: true,
        ended: false,
        missed: false
      })
      expect(
        (await refusal(api.set({ eventId: future, attending: false }))).code
      ).toBe('CONFLICT')
      expect(await ctx.presences(future)).toHaveLength(1)
    } finally {
      await ctx.cleanup()
    }
  }
)

integrationTest(
  'bar que confirma pela comanda avisa o torcedor e só dá o código como perdido depois do prazo de lançar',
  async () => {
    const ctx = await seed({ elite: true, offsets: [DAY, -DAY, -4 * DAY] })
    const [future, yesterday, lastWeek] = ctx.gameIds as [
      string,
      string,
      string
    ]
    const missed = async () =>
      Object.fromEntries(
        (await ctx.fan().attendance.mine()).map((game) => [
          game.eventId,
          game.missed
        ])
      )
    try {
      await ctx.reserve(yesterday, ctx.fanIds[0] as string)
      await ctx.reserve(lastWeek, ctx.fanIds[0] as string)
      expect(await missed()).toMatchObject({
        [yesterday]: true,
        [lastWeek]: true
      })

      await ctx.owner.pub.updateCodeConfirmation({ later: true })
      expect(
        (await ctx.fan().pubs.getById({ id: ctx.barId })).confirmsCodesLater
      ).toBe(true)
      expect(
        await ctx.fan().attendance.set({ eventId: future, attending: true })
      ).toMatchObject({ confirmsCodesLater: true })
      // Ontem ainda dá para o dono lançar; o da semana passada, não.
      expect(await missed()).toMatchObject({
        [yesterday]: false,
        [lastWeek]: true
      })

      // Sem o Elite, o bar não lança mais: volta o prazo de sempre.
      await ctx.db
        .update(subscription)
        .set({ plan: 'pro' })
        .where(eq(subscription.barId, ctx.barId))
      expect(await missed()).toMatchObject({ [yesterday]: true })
      expect(
        (await ctx.fan().attendance.mine()).every(
          (game) => !game.confirmsCodesLater
        )
      ).toBe(true)
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
  'desfazer a resposta pós-jogo: só a própria, na janela, e a pergunta volta',
  async () => {
    const ctx = await seed({
      elite: true,
      fans: 2,
      offsets: [DAY, -DAY, -(ATTENDANCE_REPORT_WINDOW_DAYS + 1) * DAY]
    })
    const [future, ended, stale] = ctx.gameIds as [string, string, string]
    const [fan, other] = ctx.fanIds as [string, string]
    const answers = (eventId: string) =>
      ctx.db
        .select({ userId: attendanceReport.userId })
        .from(attendanceReport)
        .where(eq(attendanceReport.eventId, eventId))
    const pending = async () =>
      (await ctx.fan(0).attendance.pendingReports()).map(
        ({ eventId, offer }) => ({ eventId, offer })
      )
    try {
      await ctx.reserve(ended, fan, { offer: 'Chopp em dobro' })
      await ctx.attend(ended, [other])
      // Resposta antiga, de quando a janela do jogo ainda estava aberta.
      await ctx.attend(stale, [fan])
      await ctx.db
        .insert(attendanceReport)
        .values({ eventId: stale, userId: fan, attended: true })
      const question = [{ eventId: ended, offer: 'Chopp em dobro' }]
      expect(await pending()).toEqual(question)

      await ctx.fan(0).attendance.report({
        eventId: ended,
        attended: true,
        offerReceived: true
      })
      await ctx.fan(1).attendance.report({ eventId: ended, attended: false })
      expect(await pending()).toEqual([])

      // Apaga só a resposta de quem pediu, e a pergunta volta igual.
      await ctx.fan(0).attendance.removeReport({ eventId: ended })
      expect(await answers(ended)).toEqual([{ userId: other }])
      expect(await pending()).toEqual(question)

      // Desfazer de novo, sem resposta gravada, não é erro.
      expect(
        await ctx.fan(0).attendance.removeReport({ eventId: ended })
      ).toEqual({ success: true })
      expect(await answers(ended)).toEqual([{ userId: other }])

      // Fora da janela a resposta não muda mais, nem por remoção.
      expect(
        (await refusal(ctx.fan(0).attendance.removeReport({ eventId: stale })))
          .code
      ).toBe('NOT_FOUND')
      expect(await answers(stale)).toEqual([{ userId: fan }])
      // Jogo em que o torcedor não tem pergunta.
      expect(
        (await refusal(ctx.fan(0).attendance.removeReport({ eventId: future })))
          .code
      ).toBe('NOT_FOUND')
      expect(
        (await refusal(ctx.owner.attendance.removeReport({ eventId: ended })))
          .code
      ).toBe('FORBIDDEN')
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

      // O alerta conta na leitura: resposta desfeita sai do cruzamento.
      await ctx.fan(0).attendance.removeReport({ eventId: last })
      expect(await alertFor()).toBeUndefined()

      expect(
        (await refusal(ctx.owner.attendance.unregisteredAlerts())).code
      ).toBe('FORBIDDEN')
    } finally {
      await ctx.cleanup()
    }
  }
)

integrationTest(
  'lista de quem vai desligada no jogo: recusa marcação nova e some do painel, quem já marcou fica',
  async () => {
    const ctx = await seed({ elite: true })
    const [future] = ctx.gameIds as [string]
    const attendanceOf = async (index: number) =>
      (await ctx.fan(index).pubs.getById({ id: ctx.barId })).events.find(
        ({ id }) => id === future
      )?.attendance
    try {
      const before = await ctx.fan(0).attendance.set({
        eventId: future,
        attending: true
      })
      await ctx.owner.pub.updateEvent({
        eventId: future,
        attendanceEnabled: false
      })

      // Marcação nova: recusada, como a de jogo começado, e sem botão no app.
      const refused = await refusal(
        ctx.fan(1).attendance.set({ eventId: future, attending: true })
      )
      expect(refused.code).toBe('PRECONDITION_FAILED')
      expect(refused.message).toBe(
        'O bar não abriu a lista de quem vai neste jogo.'
      )
      expect(await ctx.presences(future)).toHaveLength(1)
      expect(await attendanceOf(1)).toBeNull()

      // Quem já marcou segue com o "Você vai" e o mesmo código.
      expect(await attendanceOf(0)).toMatchObject({
        attending: true,
        code: before.code
      })
      expect(
        await ctx.fan(0).attendance.set({ eventId: future, attending: true })
      ).toEqual(before)

      // O painel não lista quem vai neste jogo.
      expect(
        (await ctx.owner.barReservations.going()).map(({ id }) => id)
      ).not.toContain(future)

      // Desmarcar continua valendo; marcar de novo, não.
      await ctx.fan(0).attendance.set({ eventId: future, attending: false })
      expect(await ctx.presences(future)).toHaveLength(0)
      expect(
        (
          await refusal(
            ctx.fan(0).attendance.set({ eventId: future, attending: true })
          )
        ).code
      ).toBe('PRECONDITION_FAILED')

      // Religada, volta tudo.
      await ctx.owner.pub.updateEvent({
        eventId: future,
        attendanceEnabled: true
      })
      await ctx.fan(1).attendance.set({ eventId: future, attending: true })
      expect(
        (await ctx.owner.barReservations.going()).map(({ id }) => id)
      ).toContain(future)
    } finally {
      await ctx.cleanup()
    }
  }
)

integrationTest(
  '"Chegaram agora" conta as visitas a este bar no mês do jogo, a comanda na data do jogo, e a oferta do código',
  async () => {
    const ctx = await seed({ elite: true, fans: 4, offsets: [DAY] })
    const [tonight] = ctx.gameIds as [string]
    const [ana, bia, caio, davi] = ctx.fanIds as [
      string,
      string,
      string,
      string
    ]
    const otherOwner = crypto.randomUUID()
    try {
      for (const [id, name] of [
        [ana, 'Ana'],
        [bia, 'Bia'],
        [caio, 'Caio'],
        [davi, 'Davi']
      ] as const) {
        await ctx.db.update(user).set({ name }).where(eq(user.id, id))
      }
      const [game] = await ctx.db
        .select({ startsAt: event.startsAt })
        .from(event)
        .where(eq(event.id, tonight))
      // O primeiro instante do mês de Brasília do jogo, e o último do anterior.
      const month = monthStart(game?.startsAt)
      const [thisMonth, lastMonth] = await ctx.db
        .insert(event)
        .values(
          [month, new Date(month.getTime() - 60_000)].map((startsAt) => ({
            barId: ctx.barId,
            sportId: ctx.sportId,
            championship: 'Campeonato de integração',
            startsAt
          }))
        )
        .returning({ id: event.id })
        .then((rows) => rows.map(({ id }) => id))
      await ctx.db.insert(user).values({
        id: otherOwner,
        role: 'pub',
        name: 'Outro dono',
        email: `${otherOwner}@integration.invalid`,
        emailVerified: true
      })
      const [otherBar] = await ctx.db
        .insert(bar)
        .values({
          userId: otherOwner,
          name: 'Outro bar',
          address: 'Rua descartável, 2',
          neighborhood: 'Teste',
          city: 'Teste',
          latitude: '-23.55052000',
          longitude: '-46.63330800',
          isActive: true
        })
        .returning({ id: bar.id })
      const [elsewhere] = await ctx.db
        .insert(event)
        .values({
          barId: otherBar?.id as string,
          sportId: ctx.sportId,
          championship: 'Campeonato de integração',
          startsAt: month
        })
        .returning({ id: event.id })

      // Ana: o jogo do mês passado lançado pela comanda já neste mês (conta
      // no mês do jogo), um no começo deste mês e o de hoje, com oferta.
      const lastMonthCode = await ctx.reserve(lastMonth as string, ana)
      await ctx.db.insert(reservationCodeUse).values({
        codeId: lastMonthCode,
        usedAt: new Date(month.getTime() + HOUR),
        late: true
      })
      await ctx.reserve(thisMonth as string, ana, { registered: true })
      await ctx.reserve(tonight, ana, {
        offer: 'Chopp em dobro',
        registered: true
      })
      // Bia: só foi a outro bar; aqui é a primeira vez, sem oferta no código.
      await ctx.reserve(elsewhere?.id as string, bia, { registered: true })
      await ctx.reserve(tonight, bia, { registered: true })
      // Caio: veio no mês passado e volta agora.
      await ctx.reserve(lastMonth as string, caio, { registered: true })
      await ctx.reserve(tonight, caio, { registered: true })
      // Davi marcou e não validou: o bar não vê histórico dele.
      await ctx.reserve(tonight, davi, { offer: 'Chopp em dobro' })

      const [going] = await ctx.owner.barReservations.going()
      expect(going?.id).toBe(tonight)
      expect(
        Object.fromEntries(
          (going?.people ?? []).map(({ name, arrival }) => [name, arrival])
        )
      ).toEqual({
        Ana: { offer: true, firstVisit: false, visitsThisMonth: 2 },
        Bia: { offer: false, firstVisit: true, visitsThisMonth: 1 },
        Caio: { offer: false, firstVisit: false, visitsThisMonth: 1 },
        Davi: null
      })
    } finally {
      await ctx.db.delete(user).where(eq(user.id, otherOwner))
      await ctx.cleanup()
    }
  }
)
