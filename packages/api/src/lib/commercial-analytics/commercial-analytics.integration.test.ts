import { afterAll, expect, test } from 'bun:test'
import { isDisposableTestDatabase } from '@findsports_oficial/db/utils/db-resolver'
import type { Context } from '../../context'

/**
 * WEB-97: duas ações comerciais diferentes disparadas em paralelo como as
 * primeiras do mesmo fan/bar/dia somavam 2 em unique_visitors (e 2 em
 * interested_people, quando as duas eram de alta intenção).
 *
 * A corrida é real: tipos diferentes não colidem na chave de deduplicação
 * (bar, fan, tipo, dia, jogo), e o snapshot por instrução fazia os dois
 * `prior` enxergarem "nenhum evento" antes de qualquer commit — cada um
 * incrementava o rollup em 1. O lock de consultoria (mesma transação,
 * chave fan/bar/dia) serializa o par; este arquivo é o portão de regressão.
 *
 * Por isso exige PostgreSQL de verdade no banco descartável: isolamento
 * READ COMMITTED, lock de consultoria e índices únicos não existem para
 * simular em memória.
 */
const integrationTest = isDisposableTestDatabase() ? test : test.skip

type CommercialEventType =
  | 'profile_view'
  | 'directions_opened'
  | 'phone_clicked'
  | 'whatsapp_opened'

const HIGH_INTENT_TYPES: readonly CommercialEventType[] = [
  'directions_opened',
  'phone_clicked',
  'whatsapp_opened'
]

function fanContext(userId: string, now = new Date()): Context {
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
        name: `Fan ${userId}`,
        email: `${userId}@integration.invalid`,
        emailVerified: true,
        image: null,
        role: 'fan',
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

/**
 * Semeia um par (fan, bar) sem nenhum evento no dia, com telefone/WhatsApp
 * configurados — o bar precisa deles para `phone_clicked`/`whatsapp_opened`,
 * que são as ações de alta intenção do cenário. O bar não precisa de plano
 * ativo: o gravador não consulta a assinatura, só `is_active` e telefone.
 */
// Usuários semeados por `seedFanBarPair`. Sem a limpeza, cada rodada deixava
// bares ativos no centro de São Paulo, e com o acúmulo eles empurravam para
// fora da página o bar de outros testes de busca (falha intermitente local).
const seededUserIds: string[] = []

afterAll(async () => {
  if (seededUserIds.length === 0) return
  const { db, inArray } = await import('@findsports_oficial/db')
  const { user } = await import('@findsports_oficial/db/schema/auth')
  // O bar, os eventos comerciais e os rollups caem em cascata com o dono.
  await db.delete(user).where(inArray(user.id, seededUserIds))
})

async function seedFanBarPair(now = new Date()) {
  const { db } = await import('@findsports_oficial/db')
  const { user } = await import('@findsports_oficial/db/schema/auth')
  const { bar } = await import('@findsports_oficial/db/schema/platform')

  const fanId = crypto.randomUUID()
  const pubUserId = crypto.randomUUID()
  const barId = crypto.randomUUID()
  seededUserIds.push(fanId, pubUserId)

  await db.insert(user).values([
    {
      id: fanId,
      name: 'Fan de integração',
      email: `${fanId}@integration.invalid`,
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

  await db.insert(bar).values({
    id: barId,
    userId: pubUserId,
    name: 'Pub de integração',
    address: 'Rua descartável, 1',
    neighborhood: 'Teste',
    city: 'Teste',
    latitude: '-23.55052000',
    longitude: '-46.63330800',
    phone: '+5511999999999',
    phoneAcceptsWhatsapp: true,
    isActive: true
  })

  return { fanId, pubUserId, barId, ctx: fanContext(fanId, now) }
}

integrationTest(
  'açoes paralelas como primeiras do dia nao duplicam visitantes (WEB-97)',
  async () => {
    const { db, eq } = await import('@findsports_oficial/db')
    const { barCommercialDailyRollup, barCommercialEvent } = await import(
      '@findsports_oficial/db/schema/analytics'
    )
    const { recordCommercialEvent } = await import('./recorder')

    const { barId, ctx } = await seedFanBarPair()
    const firstActions: CommercialEventType[] = [
      'profile_view',
      'directions_opened',
      'phone_clicked',
      'whatsapp_opened'
    ]

    // Quatro primeiras ações em paralelo, tipos diferentes: se o par não
    // estivesse serializado, cada uma delas estrearia o dia com +1.
    const results = await Promise.allSettled(
      firstActions.map((type) =>
        recordCommercialEvent(ctx, { pubId: barId, type })
      )
    )

    for (const result of results) expect(result.status).toBe('fulfilled')
    const recorded = results.map((result) =>
      result.status === 'fulfilled' ? result.value.recorded : false
    )
    expect(recorded.every(Boolean)).toBe(true)

    const [rollup] = await db
      .select()
      .from(barCommercialDailyRollup)
      .where(eq(barCommercialDailyRollup.barId, barId))
    if (!rollup) throw new Error('rollup do dia não criado')

    expect(rollup.uniqueVisitors).toBe(1)
    expect(rollup.interestedPeople).toBe(1)
    expect(rollup.highIntentActions).toBe(3)
    expect(rollup.profileViews).toBe(1)
    expect(rollup.directionsOpened).toBe(1)
    expect(rollup.phoneClicked).toBe(1)
    expect(rollup.whatsappOpened).toBe(1)

    // As quatro ações precisam ter sido gravadas mesmo assim — o bug não era
    // deduplicar demais, era contar visitante único demais.
    const rawEvents = await db
      .select()
      .from(barCommercialEvent)
      .where(eq(barCommercialEvent.barId, barId))
    expect(rawEvents).toHaveLength(4)
  }
)

integrationTest(
  'intenções paralelas depois de uma view nao duplicam interested_people (WEB-97)',
  async () => {
    const { db, eq } = await import('@findsports_oficial/db')
    const { barCommercialDailyRollup, barCommercialEvent } = await import(
      '@findsports_oficial/db/schema/analytics'
    )
    const { recordCommercialEvent } = await import('./recorder')

    const { barId, ctx } = await seedFanBarPair()

    // Primeira ação do dia sem intenção: já conta o visitante, mas a estreia
    // de intenção ainda está em aberto.
    const first = await recordCommercialEvent(ctx, {
      pubId: barId,
      type: 'profile_view'
    })
    expect(first.recorded).toBe(true)

    const results = await Promise.allSettled(
      HIGH_INTENT_TYPES.map((type) =>
        recordCommercialEvent(ctx, { pubId: barId, type })
      )
    )

    for (const result of results) expect(result.status).toBe('fulfilled')
    const recorded = results.map((result) =>
      result.status === 'fulfilled' ? result.value.recorded : false
    )
    expect(recorded.every(Boolean)).toBe(true)

    const [rollup] = await db
      .select()
      .from(barCommercialDailyRollup)
      .where(eq(barCommercialDailyRollup.barId, barId))
    if (!rollup) throw new Error('rollup do dia não criado')

    expect(rollup.uniqueVisitors).toBe(1)
    expect(rollup.interestedPeople).toBe(1)
    expect(rollup.highIntentActions).toBe(3)
    expect(rollup.profileViews).toBe(1)

    const rawEvents = await db
      .select()
      .from(barCommercialEvent)
      .where(eq(barCommercialEvent.barId, barId))
    expect(rawEvents).toHaveLength(4)
  }
)

/**
 * WEB-258 e WEB-323: a linha de "Como cada jogo foi". O nome sai dos times
 * (antes era `campeonato - Evento`, igual para todo jogo do campeonato), e o
 * jogo encerrado traz as pessoas com reserva confirmada e as chegadas que o
 * bar registrou — `used_count` é mantido por trigger, então só o banco de
 * verdade diz o número.
 */
integrationTest(
  'por jogo: nome pelos times, reservas e chegadas do jogo encerrado',
  async () => {
    const { db, inArray } = await import('@findsports_oficial/db')
    const { user } = await import('@findsports_oficial/db/schema/auth')
    const { attendance } = await import(
      '@findsports_oficial/db/schema/attendance'
    )
    const { event, eventParticipants, sport, team } = await import(
      '@findsports_oficial/db/schema/platform'
    )
    const { reservation, reservationCode, reservationCodeUse } = await import(
      '@findsports_oficial/db/schema/reservation'
    )
    const { readAttendanceQuestions } = await import('../attendance')
    const { getMyEventAnalytics } = await import('./queries')

    const { fanId, pubUserId, barId } = await seedFanBarPair()
    const sportId = crypto.randomUUID()
    const otherFans = [crypto.randomUUID(), crypto.randomUUID()]
    const hoursAgo = (n: number) => new Date(Date.now() - n * 3_600_000)

    try {
      await db.insert(user).values(
        otherFans.map((id) => ({
          id,
          name: 'Fan de integração',
          email: `${id}@integration.invalid`,
          emailVerified: true,
          role: 'fan' as const,
          onboardingCompleted: true
        }))
      )
      await db.insert(sport).values({
        id: sportId,
        name: `Esporte ${sportId}`,
        slug: `web258-${sportId}`
      })
      // Fora de ordem de propósito: o nome sai em ordem alfabética.
      const teams = ['Palmeiras', 'Corinthians'].map((name) => ({
        id: crypto.randomUUID(),
        sportId,
        name,
        slug: `${name}-${sportId}`
      }))
      await db.insert(team).values(teams)

      const game = { barId, sportId, championship: 'Brasileirão' }
      const [ended, freeText, bare] = await db
        .insert(event)
        .values([
          // Começou há 6 h, sem fim informado: encerrado há 3 h.
          { ...game, startsAt: hoursAgo(6) },
          {
            ...game,
            participantFreeText: 'Final do amador',
            startsAt: hoursAgo(5)
          },
          { ...game, participantFreeText: '', startsAt: hoursAgo(4) }
        ])
        .returning({ id: event.id })
      if (!ended || !freeText || !bare) throw new Error('jogos não criados')
      await db
        .insert(eventParticipants)
        .values(teams.map(({ id }) => ({ eventId: ended.id, teamId: id })))

      // Duas reservas confirmadas (4 + 2 pessoas) e uma pendente, que não
      // conta. Três chegadas registradas na primeira.
      const reserve = async (
        userId: string,
        partySize: number,
        status: 'confirmed' | 'pending',
        arrivals = 0
      ) => {
        const [created] = await db
          .insert(reservation)
          .values({ eventId: ended.id, userId, partySize, status })
          .returning({ id: reservation.id })
        if (!created) throw new Error('reserva não criada')
        const [code] = await db
          .insert(reservationCode)
          .values({
            code: crypto
              .randomUUID()
              .replace(/-/g, '')
              .slice(0, 10)
              .toUpperCase(),
            reservationId: created.id,
            maxUses: partySize
          })
          .returning({ id: reservationCode.id })
        if (!code) throw new Error('código não criado')
        for (let i = 0; i < arrivals; i++) {
          await db.insert(reservationCodeUse).values({ codeId: code.id })
        }
      }
      await reserve(fanId, 4, 'confirmed', 3)
      await reserve(otherFans[0] as string, 2, 'confirmed')
      await reserve(otherFans[1] as string, 5, 'pending')

      const { events } = await getMyEventAnalytics(
        barId,
        hoursAgo(24),
        new Date()
      )
      const row = (id: string) => events.find((item) => item.eventId === id)

      expect(row(ended.id)).toMatchObject({
        eventName: 'Corinthians × Palmeiras',
        reservedPeople: 6,
        arrivals: 3
      })
      expect(row(freeText.id)).toMatchObject({
        eventName: 'Final do amador',
        reservedPeople: 0,
        arrivals: 0
      })
      // Texto livre vazio não é nome: sobra o campeonato.
      expect(row(bare.id)?.eventName).toBe('Brasileirão')

      // A pergunta "Depois do jogo" lê os times pela mesma subconsulta.
      await db.insert(attendance).values({ userId: fanId, eventId: ended.id })
      expect(await readAttendanceQuestions(fanId, ended.id)).toMatchObject([
        {
          championship: 'Brasileirão',
          participantFreeText: null,
          participants: ['Corinthians', 'Palmeiras']
        }
      ])
    } finally {
      await db
        .delete(user)
        .where(inArray(user.id, [fanId, pubUserId, ...otherFans]))
      await db.delete(sport).where(inArray(sport.id, [sportId]))
    }
  }
)
