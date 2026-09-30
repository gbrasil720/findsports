import { expect, test } from 'bun:test'
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
async function seedFanBarPair(now = new Date()) {
  const { db } = await import('@findsports_oficial/db')
  const { user } = await import('@findsports_oficial/db/schema/auth')
  const { bar } = await import('@findsports_oficial/db/schema/platform')

  const fanId = crypto.randomUUID()
  const pubUserId = crypto.randomUUID()
  const barId = crypto.randomUUID()

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

  return { fanId, barId, ctx: fanContext(fanId, now) }
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
