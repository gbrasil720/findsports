import { expect, test } from 'bun:test'
import { and, eq, inArray, sql } from '@findsports_oficial/db'
import {
  barCommercialDailyRollup,
  barCommercialEvent,
  barCommercialEventDailyRollup
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

function pubContext(userId: string, now = new Date()) {
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
        name: 'Pub de integração',
        email: `${userId}@integration.invalid`,
        emailVerified: true,
        role: 'pub' as const,
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

// WEB-110: a consolidação não varre mais a tabela de brutos inteira — cada
// projeção começa no primeiro dia que ela própria ainda não fechou. O piso é o
// MENOR dia pendente, não o maior dia já consolidado: um dia antigo pendente
// continua sendo consolidado mesmo com dia mais novo já finalizado. E o dia já
// finalizado que cai dentro da faixa segue protegido pelo `ON CONFLICT`.
integrationTest(
  'WEB-110: o piso da consolidação é o dia pendente mais antigo, e não reescreve dia já fechado',
  async () => {
    const [{ db }, { runAnalyticsRetention }] = await Promise.all([
      import('@findsports_oficial/db'),
      import('../lib/commercial-analytics/recorder')
    ])

    const dia = (offsetDias: number): Date => {
      const d = new Date()
      d.setUTCHours(12, 0, 0, 0)
      d.setUTCDate(d.getUTCDate() + offsetDias)
      return d
    }
    const iso = (d: Date) => d.toISOString().slice(0, 10)

    const diaPendente = dia(-10)
    const diaFechado = dia(-3)

    const barId = crypto.randomUUID()
    const pubUserId = crypto.randomUUID()
    const jogoId = crypto.randomUUID()
    const fanIds = [crypto.randomUUID(), crypto.randomUUID()] as const

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
      occurredAt,
      commercialDay: getCommercialDay(occurredAt),
      createdAt: occurredAt
    })

    try {
      await db.insert(user).values([
        {
          id: pubUserId,
          name: 'Pub WEB-110',
          email: `pub-${pubUserId}@web110.invalid`,
          emailVerified: true,
          role: 'pub' as const,
          onboardingCompleted: true
        },
        ...fanIds.map((id, i) => ({
          id,
          name: `Fan WEB-110 ${i}`,
          email: `fan-${id}@web110.invalid`,
          emailVerified: true,
          role: 'fan' as const,
          onboardingCompleted: true
        }))
      ])
      await db.insert(bar).values({
        id: barId,
        userId: pubUserId,
        name: 'Bar WEB-110',
        address: 'Rua Central, 110',
        neighborhood: 'Centro',
        city: 'São Paulo',
        latitude: '-23.55000000',
        longitude: '-46.63000000',
        isActive: true
      })

      await db
        .insert(barCommercialEvent)
        .values([
          rawRow(fanIds[0], 'profile_view', diaPendente),
          rawRow(fanIds[0], 'phone_clicked', diaPendente, jogoId),
          rawRow(fanIds[1], 'profile_view', diaPendente, jogoId),
          rawRow(fanIds[1], 'profile_view', diaFechado)
        ])

      // Dia antigo pendente, como o gravador o deixa; dia mais novo já
      // fechado, com contador propositalmente errado para provar que a
      // consolidação não o reescreve mesmo caindo dentro da faixa varrida.
      await db.insert(barCommercialDailyRollup).values([
        { barId, commercialDay: iso(diaPendente), isFinalized: false },
        {
          barId,
          commercialDay: iso(diaFechado),
          profileViews: 99,
          uniqueVisitors: 99,
          isFinalized: true
        }
      ])
      await db.insert(barCommercialEventDailyRollup).values({
        barId,
        eventId: jogoId,
        commercialDay: iso(diaPendente),
        isFinalized: false
      })

      await runAnalyticsRetention({ retentionDays: 365 })

      const [pendente] = await db
        .select()
        .from(barCommercialDailyRollup)
        .where(
          and(
            eq(barCommercialDailyRollup.barId, barId),
            eq(barCommercialDailyRollup.commercialDay, iso(diaPendente))
          )
        )
      expect(pendente?.isFinalized).toBe(true)
      expect(pendente?.profileViews).toBe(2)
      expect(pendente?.phoneClicked).toBe(1)
      expect(pendente?.uniqueVisitors).toBe(2)
      expect(pendente?.interestedPeople).toBe(1)
      expect(pendente?.highIntentActions).toBe(1)

      const [porJogo] = await db
        .select()
        .from(barCommercialEventDailyRollup)
        .where(eq(barCommercialEventDailyRollup.barId, barId))
      expect(porJogo?.isFinalized).toBe(true)
      expect(porJogo?.profileViews).toBe(1)
      expect(porJogo?.phoneClicked).toBe(1)

      const [fechado] = await db
        .select()
        .from(barCommercialDailyRollup)
        .where(
          and(
            eq(barCommercialDailyRollup.barId, barId),
            eq(barCommercialDailyRollup.commercialDay, iso(diaFechado))
          )
        )
      expect(fechado?.profileViews).toBe(99)
      expect(fechado?.uniqueVisitors).toBe(99)
    } finally {
      await db
        .delete(barCommercialEventDailyRollup)
        .where(eq(barCommercialEventDailyRollup.barId, barId))
      await db
        .delete(barCommercialDailyRollup)
        .where(eq(barCommercialDailyRollup.barId, barId))
      await db
        .delete(barCommercialEvent)
        .where(eq(barCommercialEvent.barId, barId))
      await db.delete(user).where(inArray(user.id, [pubUserId, ...fanIds]))
    }
  }
)

// WEB-110: `commercial_day` é gravado em America/Sao_Paulo e o servidor roda em
// UTC. Com `CURRENT_DATE` como teto, das 21h à meia-noite de São Paulo o dia
// corrente já contava como fechado e era consolidado enquanto ainda recebia
// evento. O teto passou a ser o dia comercial do instante de referência.
integrationTest(
  'WEB-110: o teto da consolidação é o dia comercial, não a data UTC do servidor',
  async () => {
    const [{ db }, { runAnalyticsRetention }] = await Promise.all([
      import('@findsports_oficial/db'),
      import('../lib/commercial-analytics/recorder')
    ])

    // meio-dia UTC = 09h em São Paulo: mesmo dia comercial do offset
    const dia = (offsetDias: number): Date => {
      const d = new Date()
      d.setUTCHours(12, 0, 0, 0)
      d.setUTCDate(d.getUTCDate() + offsetDias)
      return d
    }

    const diaCorrente = getCommercialDay(dia(-2))
    const diaAnterior = getCommercialDay(dia(-3))
    // 22h30 em São Paulo do dia corrente = 01h30 UTC do dia seguinte. É a
    // janela em que a data do servidor e o dia comercial discordam.
    const agora = new Date(`${diaCorrente}T22:30:00.000-03:00`)

    const barId = crypto.randomUUID()
    const pubUserId = crypto.randomUUID()
    const fanId = crypto.randomUUID()

    const rawRow = (occurredAt: Date) => ({
      id: crypto.randomUUID(),
      barId,
      actorUserId: fanId,
      type: 'profile_view' as const,
      occurredAt,
      commercialDay: getCommercialDay(occurredAt),
      createdAt: occurredAt
    })

    try {
      await db.insert(user).values([
        {
          id: pubUserId,
          name: 'Pub WEB-110 fuso',
          email: `pub-${pubUserId}@web110tz.invalid`,
          emailVerified: true,
          role: 'pub' as const,
          onboardingCompleted: true
        },
        {
          id: fanId,
          name: 'Fan WEB-110 fuso',
          email: `fan-${fanId}@web110tz.invalid`,
          emailVerified: true,
          role: 'fan' as const,
          onboardingCompleted: true
        }
      ])
      await db.insert(bar).values({
        id: barId,
        userId: pubUserId,
        name: 'Bar WEB-110 fuso',
        address: 'Rua Central, 111',
        neighborhood: 'Centro',
        city: 'São Paulo',
        latitude: '-23.55000000',
        longitude: '-46.63000000',
        isActive: true
      })
      await db
        .insert(barCommercialEvent)
        .values([rawRow(dia(-3)), rawRow(dia(-2))])
      await db.insert(barCommercialDailyRollup).values([
        { barId, commercialDay: diaAnterior, isFinalized: false },
        { barId, commercialDay: diaCorrente, isFinalized: false }
      ])

      await runAnalyticsRetention({ retentionDays: 365, agora })

      const rollups = await db
        .select()
        .from(barCommercialDailyRollup)
        .where(eq(barCommercialDailyRollup.barId, barId))
      const anterior = rollups.find((r) => r.commercialDay === diaAnterior)
      const corrente = rollups.find((r) => r.commercialDay === diaCorrente)

      // Dia já fechado às 22h30 de São Paulo: consolidado.
      expect(anterior?.isFinalized).toBe(true)
      expect(anterior?.profileViews).toBe(1)
      // Dia ainda em curso naquele instante: intocado, mesmo com a data UTC
      // do servidor já apontando para depois dele.
      expect(corrente?.isFinalized).toBe(false)
      expect(corrente?.profileViews).toBe(0)
    } finally {
      await db
        .delete(barCommercialDailyRollup)
        .where(eq(barCommercialDailyRollup.barId, barId))
      await db
        .delete(barCommercialEvent)
        .where(eq(barCommercialEvent.barId, barId))
      await db.delete(user).where(inArray(user.id, [pubUserId, fanId]))
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
    const otherBarId = crypto.randomUUID()
    const otherPubUserId = crypto.randomUUID()
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
        {
          id: otherPubUserId,
          name: 'Outro pub WEB-104',
          email: `pub-${otherPubUserId}@web104.invalid`,
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
      await db.insert(bar).values([
        {
          id: barId,
          userId: pubUserId,
          name: 'Bar WEB-98',
          address: 'Rua Central, 100',
          neighborhood: 'Centro',
          city: 'São Paulo',
          latitude: '-23.55000000',
          longitude: '-46.63000000',
          isActive: true
        },
        {
          id: otherBarId,
          userId: otherPubUserId,
          name: 'Outro bar WEB-104',
          address: 'Rua Isolada, 104',
          neighborhood: 'Centro',
          city: 'São Paulo',
          latitude: '-23.55100000',
          longitude: '-46.63100000',
          isActive: true
        }
      ])
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
        rawRow(fanIds[0], 'phone_clicked', oldDay, oldEventId),
        rawRow(fanIds[1], 'profile_view', oldDay),
        rawRow(fanIds[1], 'directions_opened', oldDay),
        rawRow(fanIds[2], 'profile_view', oldDay, oldEventId),
        // Dia que sobrevive (3 dias atrás): 4 ações, 3 visitantes distintos
        rawRow(fanIds[3], 'profile_view', recentDay),
        rawRow(fanIds[4], 'profile_view', recentDay),
        rawRow(fanIds[4], 'whatsapp_opened', recentDay),
        rawRow(fanIds[5], 'profile_view', recentDay, recentEventId)
      ])

      // WEB-110: em produção a linha do rollup nasce no mesmo comando do
      // evento bruto, e a consolidação passou a começar no primeiro dia que
      // cada projeção ainda não fechou. O fixture insere bruto direto, então
      // registra os dias do mesmo jeito que o gravador faria — sem finalizar,
      // que é justamente o que a retenção abaixo vai fazer.
      await db.execute(sql`
        INSERT INTO bar_commercial_daily_rollup (bar_id, commercial_day, is_finalized)
        SELECT DISTINCT bar_id, commercial_day, false
        FROM bar_commercial_event
        WHERE bar_id = ${barId}
        ON CONFLICT (bar_id, commercial_day) DO NOTHING
      `)
      await db.execute(sql`
        INSERT INTO bar_commercial_event_daily_rollup (
          bar_id, event_id, commercial_day, is_finalized
        )
        SELECT DISTINCT bar_id, source_event_id, commercial_day, false
        FROM bar_commercial_event
        WHERE bar_id = ${barId}
          AND source_event_id IS NOT NULL
        ON CONFLICT (bar_id, event_id, commercial_day) DO NOTHING
      `)

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

      // Mesmo event_id em outra barra não pode contaminar a atribuição deste
      // bar; a dimensão de tenant é parte da chave da projeção.
      await db.insert(barCommercialEventDailyRollup).values({
        barId: otherBarId,
        eventId: oldEventId,
        commercialDay: iso(oldDay),
        profileViews: 99,
        isFinalized: true
      })

      // ------------------- Fase C: leitura do mesmo período ---------------
      const depois = await getMyAnalyticsOverview(barId, from, to)
      expect(depois.from).toBe(iso(from))
      expect(depois.to).toBe(iso(dia(0)))
      expect(depois.profileViews).toBe(6)
      expect(depois.directionsOpened).toBe(1)
      expect(depois.phoneClicked).toBe(1)
      expect(depois.whatsappOpened).toBe(1)
      // Conjuntos disjuntos por dia: o total distinto permanece exato após a
      // poda (a perda de precisão documentada só aparece com visitante nos
      // dois lados do limite).
      expect(depois.uniqueVisitors).toBe(6)
      expect(depois.interestedPeople).toBe(3)
      expect(depois.limitations).toEqual([
        'distinct_counts_are_daily_sums_after_retention'
      ])
      // O dia podado volta na série diária vindo do rollup finalizado.
      expect(
        depois.dailyProfileViews.find((p) => p.date === iso(oldDay))?.value
      ).toBe(3)
      expect(
        depois.dailyProfileViews.find((p) => p.date === iso(recentDay))?.value
      ).toBe(3)

      // Quebra por evento: o evento antigo continua listado e as métricas
      // voltam da projeção por jogo mesmo depois da poda.
      const depoisEventos = await getMyEventAnalytics(barId, from, to)
      const velhoDepois = depoisEventos.events.find(
        (e) => e.eventId === oldEventId
      )
      const novoDepois = depoisEventos.events.find(
        (e) => e.eventId === recentEventId
      )
      expect(velhoDepois?.eventName).toBe('Torneio WEB-98 - Evento')
      expect(velhoDepois?.profileViews).toBe(1)
      expect(velhoDepois?.phoneClicked).toBe(1)
      expect(novoDepois?.profileViews).toBe(1)
    } finally {
      await db
        .delete(barCommercialEventDailyRollup)
        .where(
          inArray(barCommercialEventDailyRollup.barId, [barId, otherBarId])
        )
      await db
        .delete(barCommercialDailyRollup)
        .where(eq(barCommercialDailyRollup.barId, barId))
      await db
        .delete(barCommercialEvent)
        .where(eq(barCommercialEvent.barId, barId))
      await db
        .delete(user)
        .where(inArray(user.id, [pubUserId, otherPubUserId, ...fanIds]))
      await db.delete(sport).where(eq(sport.id, sportId))
    }
  }
)

integrationTest(
  'WEB-103: comparação fica isolada no bar e mascara canais do Pro',
  async () => {
    const [{ db }, { appRouter }] = await Promise.all([
      import('@findsports_oficial/db'),
      import('./index')
    ])
    const pubUserId = crypto.randomUUID()
    const otherPubUserId = crypto.randomUUID()
    const fanUserId = crypto.randomUUID()
    const barId = crypto.randomUUID()
    const otherBarId = crypto.randomUUID()
    const sportId = crypto.randomUUID()
    const firstEventId = crypto.randomUUID()
    const secondEventId = crypto.randomUUID()
    const foreignEventId = crypto.randomUUID()
    const now = new Date()
    const firstStartsAt = new Date('2026-09-10T20:00:00.000Z')
    const secondStartsAt = new Date('2026-09-12T20:00:00.000Z')
    const foreignStartsAt = new Date('2026-09-14T20:00:00.000Z')

    try {
      await db.insert(user).values([
        {
          id: pubUserId,
          name: 'Pub WEB-103',
          email: `pub-${pubUserId}@web103.invalid`,
          emailVerified: true,
          role: 'pub',
          onboardingCompleted: true
        },
        {
          id: otherPubUserId,
          name: 'Outro pub WEB-103',
          email: `pub-${otherPubUserId}@web103.invalid`,
          emailVerified: true,
          role: 'pub',
          onboardingCompleted: true
        },
        {
          id: fanUserId,
          name: 'Fan WEB-103',
          email: `fan-${fanUserId}@web103.invalid`,
          emailVerified: true,
          role: 'fan',
          onboardingCompleted: true
        }
      ])
      await db.insert(sport).values({
        id: sportId,
        name: 'Futebol WEB-103',
        slug: `web103-${sportId}`
      })
      await db.insert(bar).values([
        {
          id: barId,
          userId: pubUserId,
          name: 'Bar WEB-103',
          address: 'Rua WEB-103, 1',
          neighborhood: 'Centro',
          city: 'São Paulo',
          latitude: '-23.55000000',
          longitude: '-46.63000000',
          isActive: true
        },
        {
          id: otherBarId,
          userId: otherPubUserId,
          name: 'Outro bar WEB-103',
          address: 'Rua WEB-103, 2',
          neighborhood: 'Centro',
          city: 'São Paulo',
          latitude: '-23.55010000',
          longitude: '-46.63010000',
          isActive: true
        }
      ])
      await db.insert(subscription).values([
        { barId, plan: 'pro', status: 'active' },
        { barId: otherBarId, plan: 'pro', status: 'active' }
      ])
      await db.insert(event).values([
        {
          id: firstEventId,
          barId,
          sportId,
          championship: 'WEB-103 A',
          startsAt: firstStartsAt
        },
        {
          id: secondEventId,
          barId,
          sportId,
          championship: 'WEB-103 B',
          startsAt: secondStartsAt
        },
        {
          id: foreignEventId,
          barId: otherBarId,
          sportId,
          championship: 'WEB-103 externo',
          startsAt: foreignStartsAt
        }
      ])
      await db.insert(barCommercialEvent).values([
        {
          id: crypto.randomUUID(),
          barId,
          actorUserId: fanUserId,
          type: 'profile_view',
          sourceEventId: firstEventId,
          sourceEventChampionship: 'WEB-103 A',
          sourceEventStartsAt: firstStartsAt,
          occurredAt: firstStartsAt,
          commercialDay: getCommercialDay(firstStartsAt)
        },
        {
          id: crypto.randomUUID(),
          barId,
          actorUserId: fanUserId,
          type: 'directions_opened',
          sourceEventId: firstEventId,
          sourceEventChampionship: 'WEB-103 A',
          sourceEventStartsAt: firstStartsAt,
          occurredAt: firstStartsAt,
          commercialDay: getCommercialDay(firstStartsAt)
        },
        {
          id: crypto.randomUUID(),
          barId,
          actorUserId: fanUserId,
          type: 'phone_clicked',
          sourceEventId: firstEventId,
          sourceEventChampionship: 'WEB-103 A',
          sourceEventStartsAt: firstStartsAt,
          occurredAt: firstStartsAt,
          commercialDay: getCommercialDay(firstStartsAt)
        },
        {
          id: crypto.randomUUID(),
          barId,
          actorUserId: fanUserId,
          type: 'profile_view',
          sourceEventId: secondEventId,
          sourceEventChampionship: 'WEB-103 B',
          sourceEventStartsAt: secondStartsAt,
          occurredAt: secondStartsAt,
          commercialDay: getCommercialDay(secondStartsAt)
        },
        {
          id: crypto.randomUUID(),
          barId: otherBarId,
          actorUserId: fanUserId,
          type: 'profile_view',
          sourceEventId: foreignEventId,
          sourceEventChampionship: 'WEB-103 externo',
          sourceEventStartsAt: foreignStartsAt,
          occurredAt: foreignStartsAt,
          commercialDay: getCommercialDay(foreignStartsAt)
        }
      ])

      const result = await appRouter
        .createCaller(pubContext(pubUserId, now))
        .commercialAnalytics.getMyEventAnalytics({
          from: '2026-09-01',
          to: '2026-09-30',
          comparisonTarget: {
            type: 'events',
            eventIds: [firstEventId, secondEventId, foreignEventId]
          }
        })

      expect(result.comparison?.events.map((item) => item.eventId)).toEqual([
        firstEventId,
        secondEventId
      ])
      expect(result.comparison?.events[0]?.directionsOpened).toBe(1)
      expect(result.comparison?.events[0]?.phoneClicked).toBe(1)
      expect(result.comparison?.events[0]?.uniqueVisitors).toBe(1)
    } finally {
      await db
        .delete(barCommercialEvent)
        .where(inArray(barCommercialEvent.barId, [barId, otherBarId]))
      await db
        .delete(subscription)
        .where(inArray(subscription.barId, [barId, otherBarId]))
      await db
        .delete(event)
        .where(inArray(event.id, [firstEventId, secondEventId, foreignEventId]))
      await db.delete(bar).where(inArray(bar.id, [barId, otherBarId]))
      await db
        .delete(user)
        .where(inArray(user.id, [pubUserId, otherPubUserId, fanUserId]))
      await db.delete(sport).where(eq(sport.id, sportId))
    }
  }
)
