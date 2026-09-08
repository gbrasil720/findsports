import { expect, test } from 'bun:test'
import { and, eq, inArray } from '@findsports_oficial/db'
import {
  barCommercialDailyRollup,
  barCommercialEvent
} from '@findsports_oficial/db/schema/analytics'
import { user } from '@findsports_oficial/db/schema/auth'
import {
  bar,
  event,
  sport,
  subscription
} from '@findsports_oficial/db/schema/platform'
import { isDisposableTestDatabase } from '@findsports_oficial/db/utils/db-resolver'
import { TRPCError } from '@trpc/server'
import { getCommercialDay } from '../lib/commercial-analytics/commercial-day'
import type { CommercialEventType } from '../lib/commercial-analytics/types'

const integrationTest = isDisposableTestDatabase() ? test : test.skip

function fanContext(userId: string, now = new Date()) {
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
        name: 'Fan de integração',
        email: `${userId}@integration.invalid`,
        emailVerified: true,
        image: null,
        role: 'fan' as const,
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

integrationTest(
  'WEB-96: serializa registros paralelos e não aceita o 31º evento na janela',
  async () => {
    const [{ db }, { appRouter }] = await Promise.all([
      import('@findsports_oficial/db'),
      import('./index')
    ])
    const fanUserId = crypto.randomUUID()
    const pubUserId = crypto.randomUUID()
    const barId = crypto.randomUUID()
    const sportId = crypto.randomUUID()
    const now = new Date()

    await db.insert(user).values([
      {
        id: fanUserId,
        name: 'Fan de integração',
        email: `${fanUserId}@integration.invalid`,
        emailVerified: true,
        role: 'fan',
        onboardingCompleted: true
      },
      {
        id: pubUserId,
        name: 'Pub de integração',
        email: `${pubUserId}@integration.invalid`,
        emailVerified: true,
        role: 'pub',
        onboardingCompleted: true
      }
    ])

    try {
      await db.insert(sport).values({
        id: sportId,
        name: `Esporte ${sportId}`,
        slug: `integration-${sportId}`
      })
      await db.insert(bar).values({
        id: barId,
        userId: pubUserId,
        name: 'Pub de integração',
        address: 'Rua descartável, 1',
        neighborhood: 'Teste',
        city: 'Teste',
        latitude: '-23.55052000',
        longitude: '-46.63330800',
        isActive: true
      })

      // Mais de 30 combinações deduplicáveis de tipo/jogo: cada jogo é um
      // `source_event_id` distinto, então nenhuma das 31 chamadas empata na
      // deduplicação diária — só o rate limit por minuto pode barrar.
      const sourceEvents = Array.from({ length: 31 }, (_, index) => ({
        id: crypto.randomUUID(),
        barId,
        sportId,
        championship: `Jogo ${index + 1}`,
        startsAt: new Date(now.getTime() + index * 60_000)
      }))
      await db.insert(event).values(sourceEvents)

      const caller = appRouter.createCaller(fanContext(fanUserId, now))
      const results = await Promise.allSettled(
        sourceEvents.map((ev) =>
          caller.commercialAnalytics.recordCommercialEvent({
            pubId: barId,
            type: 'profile_view',
            sourceEventId: ev.id
          })
        )
      )

      const fulfilled = results.filter((r) => r.status === 'fulfilled')
      const rejected = results.filter(
        (r): r is PromiseRejectedResult => r.status === 'rejected'
      )

      expect(fulfilled).toHaveLength(30)
      expect(rejected).toHaveLength(1)
      const reason = rejected[0]?.reason
      expect(reason).toBeInstanceOf(TRPCError)
      expect((reason as TRPCError).code).toBe('TOO_MANY_REQUESTS')

      const stored = await db
        .select()
        .from(barCommercialEvent)
        .where(
          and(
            eq(barCommercialEvent.actorUserId, fanUserId),
            eq(barCommercialEvent.barId, barId)
          )
        )
      expect(stored).toHaveLength(30)
    } finally {
      await db.delete(user).where(inArray(user.id, [fanUserId, pubUserId]))
      await db.delete(sport).where(eq(sport.id, sportId))
    }
  }
)

// WEB-98: depois de podar eventos brutos, o painel continua servido pelos
// rollups diários finalizados. Antes desta correção, `getMyAnalyticsOverview`
// lia só `bar_commercial_event`, e um período podado voltava zerado mesmo com
// o rollup consolidado no banco.
integrationTest(
  'WEB-98: consolidação, poda e leitura do mesmo período — o painel volta pelos rollups',
  async () => {
    const [dbPkg, recorder, queries] = await Promise.all([
      import('@findsports_oficial/db'),
      import('../lib/commercial-analytics/recorder'),
      import('../lib/commercial-analytics/queries')
    ])
    const { db } = dbPkg
    const { runAnalyticsRetention } = recorder
    const { getMyAnalyticsOverview, getMyEventAnalytics } = queries

    // meio-dia UTC = 09h em São Paulo, mesmo dia comercial do offset
    const dia = (offsetDias: number): Date => {
      const d = new Date()
      d.setUTCHours(12, 0, 0, 0)
      d.setUTCDate(d.getUTCDate() + offsetDias)
      return d
    }
    const iso = (d: Date) => d.toISOString().slice(0, 10)

    const oldDay = dia(-10)
    const recentDay = dia(-3)
    const from = new Date(`${iso(dia(-20))}T00:00:00.000-03:00`)
    const to = new Date(
      new Date(`${iso(dia(1))}T00:00:00.000-03:00`).getTime() - 1
    )

    const barId = crypto.randomUUID()
    const pubUserId = crypto.randomUUID()
    const sportId = crypto.randomUUID()
    const oldEventId = crypto.randomUUID()
    const recentEventId = crypto.randomUUID()
    // Conjuntos de visitantes disjuntos por dia, para o total distinto do
    // período continuar exato mesmo com o dia podado vindo do rollup.
    // 0,1 atuam no dia podado; 3,4 no dia recente; 2 e 5 atribuem os eventos.
    const fanIds: [string, string, string, string, string, string] = [
      crypto.randomUUID(),
      crypto.randomUUID(),
      crypto.randomUUID(),
      crypto.randomUUID(),
      crypto.randomUUID(),
      crypto.randomUUID()
    ]

    const rawRow = (
      actorUserId: string,
      type: CommercialEventType,
      occurredAt: Date,
      sourceEventId?: string
    ) => ({
      id: crypto.randomUUID(),
      barId,
      actorUserId,
      type,
      sourceEventId,
      sourceEventChampionship: sourceEventId ? 'Torneio WEB-98' : null,
      sourceEventStartsAt: sourceEventId
        ? sourceEventId === oldEventId
          ? oldDay
          : recentDay
        : null,
      occurredAt,
      commercialDay: getCommercialDay(occurredAt),
      createdAt: occurredAt
    })

    try {
      const users: Array<{
        id: string
        name: string
        email: string
        emailVerified: boolean
        role: 'fan' | 'pub'
        onboardingCompleted: boolean
      }> = [
        {
          id: pubUserId,
          name: 'Pub WEB-98',
          email: `pub-${pubUserId}@web98.invalid`,
          emailVerified: true,
          role: 'pub',
          onboardingCompleted: true
        },
        ...fanIds.map((id, i) => ({
          id,
          name: `Fan WEB-98 ${i}`,
          email: `fan-${id}@web98.invalid`,
          emailVerified: true,
          role: 'fan' as const,
          onboardingCompleted: true
        }))
      ]
      await db.insert(user).values(users)
      await db.insert(sport).values({
        id: sportId,
        name: 'Futebol WEB-98',
        slug: `web98-${sportId}`
      })
      await db.insert(bar).values({
        id: barId,
        userId: pubUserId,
        name: 'Bar WEB-98',
        address: 'Rua Central, 100',
        neighborhood: 'Centro',
        city: 'São Paulo',
        latitude: '-23.55000000',
        longitude: '-46.63000000',
        isActive: true
      })
      await db
        .insert(subscription)
        .values({ barId, plan: 'elite', status: 'active' })
      await db.insert(event).values([
        {
          id: oldEventId,
          barId,
          sportId,
          championship: 'Torneio WEB-98',
          startsAt: oldDay
        },
        {
          id: recentEventId,
          barId,
          sportId,
          championship: 'Torneio WEB-98',
          startsAt: recentDay
        }
      ])

      await db.insert(barCommercialEvent).values([
        // Dia que será podado (10 dias atrás): 5 ações, 3 visitantes distintos
        rawRow(fanIds[0], 'profile_view', oldDay),
        rawRow(fanIds[0], 'phone_clicked', oldDay),
        rawRow(fanIds[1], 'profile_view', oldDay),
        rawRow(fanIds[1], 'directions_opened', oldDay),
        rawRow(fanIds[2], 'profile_view', oldDay, oldEventId),
        // Dia que sobrevive (3 dias atrás): 4 ações, 3 visitantes distintos
        rawRow(fanIds[3], 'profile_view', recentDay),
        rawRow(fanIds[4], 'profile_view', recentDay),
        rawRow(fanIds[4], 'whatsapp_opened', recentDay),
        rawRow(fanIds[5], 'profile_view', recentDay, recentEventId)
      ])

      // ------------------------- Fase A: leitura exata --------------------
      const antes = await getMyAnalyticsOverview(barId, from, to)
      expect(antes.profileViews).toBe(6)
      expect(antes.uniqueVisitors).toBe(6)
      expect(antes.interestedPeople).toBe(3)
      expect(antes.directionsOpened).toBe(1)
      expect(antes.phoneClicked).toBe(1)
      expect(antes.whatsappOpened).toBe(1)
      expect(
        antes.dailyProfileViews.find((p) => p.date === iso(oldDay))?.value
      ).toBe(3)
      expect(
        antes.dailyProfileViews.find((p) => p.date === iso(recentDay))?.value
      ).toBe(3)

      const antesEventos = await getMyEventAnalytics(barId, from, to)
      const velhoAntes = antesEventos.events.find(
        (e) => e.eventId === oldEventId
      )
      const novoAntes = antesEventos.events.find(
        (e) => e.eventId === recentEventId
      )
      expect(velhoAntes?.profileViews).toBe(1)
      expect(novoAntes?.profileViews).toBe(1)

      // ----------------- Fase B: consolidação + poda ----------------------
      const resultado = await runAnalyticsRetention({
        retentionDays: 5,
        apagarEventosBrutos: true
      })
      expect(resultado.podou).toBe(true)
      expect(resultado.eventosApagados).toBeGreaterThan(0)

      // Os 5 brutos do dia podado sumiram; os 4 do dia recente sobreviveram.
      const brutosRestantes = await db
        .select({ id: barCommercialEvent.id })
        .from(barCommercialEvent)
        .where(eq(barCommercialEvent.barId, barId))
      expect(brutosRestantes).toHaveLength(4)

      // O rollup do dia podado está finalizado — é ele que sustenta a leitura.
      const rollupPodado = await db
        .select({ isFinalized: barCommercialDailyRollup.isFinalized })
        .from(barCommercialDailyRollup)
        .where(
          and(
            eq(barCommercialDailyRollup.barId, barId),
            eq(barCommercialDailyRollup.commercialDay, iso(oldDay))
          )
        )
      expect(rollupPodado).toHaveLength(1)
      expect(rollupPodado[0]?.isFinalized).toBe(true)

      // ------------------- Fase C: leitura do mesmo período ---------------
      const depois = await getMyAnalyticsOverview(barId, from, to)
      expect(depois.profileViews).toBe(6)
      expect(depois.directionsOpened).toBe(1)
      expect(depois.phoneClicked).toBe(1)
      expect(depois.whatsappOpened).toBe(1)
      // Conjuntos disjuntos por dia: o total distinto permanece exato após a
      // poda (a perda de precisão documentada só aparece com visitante nos
      // dois lados do limite).
      expect(depois.uniqueVisitors).toBe(6)
      expect(depois.interestedPeople).toBe(3)
      // O dia podado volta na série diária vindo do rollup finalizado.
      expect(
        depois.dailyProfileViews.find((p) => p.date === iso(oldDay))?.value
      ).toBe(3)
      expect(
        depois.dailyProfileViews.find((p) => p.date === iso(recentDay))?.value
      ).toBe(3)

      // Quebra por evento: o evento antigo continua listado (a tabela `event`
      // nunca é podada), mas a atribuição dele saiu junto com o bruto — o
      // limite de precisão documentado no contrato (WEB-98).
      const depoisEventos = await getMyEventAnalytics(barId, from, to)
      const velhoDepois = depoisEventos.events.find(
        (e) => e.eventId === oldEventId
      )
      const novoDepois = depoisEventos.events.find(
        (e) => e.eventId === recentEventId
      )
      expect(velhoDepois?.eventName).toBe('Torneio WEB-98 - Evento')
      expect(velhoDepois?.profileViews).toBe(0)
      expect(novoDepois?.profileViews).toBe(1)
    } finally {
      await db
        .delete(barCommercialDailyRollup)
        .where(eq(barCommercialDailyRollup.barId, barId))
      await db
        .delete(barCommercialEvent)
        .where(eq(barCommercialEvent.barId, barId))
      await db.delete(user).where(inArray(user.id, [pubUserId, ...fanIds]))
      await db.delete(sport).where(eq(sport.id, sportId))
    }
  }
)
