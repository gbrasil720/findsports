import { afterAll, beforeAll, expect, setSystemTime, test } from 'bun:test'
import { and, eq, inArray } from '@findsports_oficial/db'
import { isDisposableTestDatabase } from '@findsports_oficial/db/utils/db-resolver'

import { contextFor, load } from './integration-seed'

/*
 * "Bares pra você" (WEB-425): a rodada de cinco por dia que vira às 10:00 de
 * Brasília, Curti e Voltar, Passo por 30 dias, e "Avisar"/"Lembrar" virando
 * aviso. Um ponto isolado no mapa para não cruzar com os bares de outros
 * testes.
 */

const integrationTest = isDisposableTestDatabase() ? test : test.skip
const ORIGIN = { lat: -32.7, lng: -42.7 }
const DAY = 86_400_000

type Ctx = Awaited<ReturnType<typeof seed>>
let ctx: Ctx | undefined

async function seed() {
  const { db, appRouter } = await load()
  const [authSchema, platformSchema, recommendationSchema] = await Promise.all([
    import('@findsports_oficial/db/schema/auth'),
    import('@findsports_oficial/db/schema/platform'),
    import('@findsports_oficial/db/schema/recommendation')
  ])
  const schema = { ...authSchema, ...platformSchema, ...recommendationSchema }
  const fanId = crypto.randomUUID()
  // Um bar por dono (`bar_user_id_unique`).
  const ownerIds = Array.from({ length: 8 }, () => crypto.randomUUID())
  const sportId = crypto.randomUUID()
  const otherSportId = crypto.randomUUID()
  const barIds = Array.from({ length: 8 }, () => crypto.randomUUID())

  await db.insert(schema.user).values([
    {
      id: fanId,
      name: 'Torcedor da rodada',
      email: `${fanId}@integration.invalid`,
      emailVerified: true,
      role: 'fan',
      onboardingCompleted: true,
      searchRadiusKm: 3
    },
    ...ownerIds.map((id) => ({
      id,
      name: 'Dono de bar da rodada',
      email: `${id}@integration.invalid`,
      emailVerified: true,
      role: 'pub' as const,
      onboardingCompleted: true
    }))
  ])
  await db.insert(schema.sport).values([
    { id: sportId, name: 'Futebol da rodada', slug: `rodada-${sportId}` },
    {
      id: otherSportId,
      name: 'Vôlei da rodada',
      slug: `rodada-${otherSportId}`
    }
  ])
  await db
    .insert(schema.userPreferenceSports)
    .values({ userId: fanId, sportId })
  await db.insert(schema.bar).values(
    barIds.map((id, index) => ({
      id,
      userId: ownerIds[index] as string,
      name: `Bar da rodada ${index + 1}`,
      address: `Rua da rodada, ${index + 1}`,
      neighborhood: `Bairro ${index % 3}`,
      city: 'Teste',
      latitude: (ORIGIN.lat + 0.002 * (index + 1)).toFixed(8),
      longitude: ORIGIN.lng.toFixed(8),
      amenities: index % 2 ? [1, 4] : [2],
      isActive: true
    }))
  )
  const fan = (now = new Date()) =>
    appRouter.createCaller(
      contextFor(fanId, 'fan', now) as Parameters<
        typeof appRouter.createCaller
      >[0]
    )
  return {
    db,
    schema,
    fan,
    fanId,
    sportId,
    otherSportId,
    barIds,
    cleanup: async () => {
      await db
        .delete(schema.user)
        .where(inArray(schema.user.id, [fanId, ...ownerIds]))
      await db
        .delete(schema.sport)
        .where(inArray(schema.sport.id, [sportId, otherSportId]))
    }
  }
}

beforeAll(async () => {
  if (isDisposableTestDatabase()) ctx = await seed()
})

afterAll(async () => {
  setSystemTime()
  await ctx?.cleanup()
})

integrationTest(
  'cinco por dia, a mesma rodada até as 10:00 de Brasília',
  async () => {
    if (!ctx) throw new Error('sem seed')
    const { fan, barIds, db, schema, fanId } = ctx

    // 09:00 de Brasília do dia 22: ainda é a rodada do dia 21.
    setSystemTime(new Date('2026-10-22T12:00:00Z'))
    const first = await fan().recommendations.today({ where: ORIGIN })
    expect(first.round?.day).toBe('2026-10-21')
    expect(first.round?.items).toHaveLength(5)
    expect(first.round?.nextRoundAt).toBe('2026-10-22T13:00:00.000Z')
    expect(first.round?.items.map((item) => item.position)).toEqual([
      1, 2, 3, 4, 5
    ])
    expect(first.round?.items.map((item) => item.slot)).toEqual([
      'sua_cara',
      'pra_variar',
      'vale_arriscar',
      'pra_variar',
      'vale_arriscar'
    ])
    const runId = first.round?.runId as string
    const [liked, passed] = first.round?.items ?? []
    if (!liked || !passed) throw new Error('rodada vazia')

    // Outra leitura, mesmo sem localização: a mesma rodada, sem bar novo.
    setSystemTime(new Date('2026-10-22T12:59:59Z'))
    const again = await fan().recommendations.today({ where: null })
    expect(again.round?.runId).toBe(runId)
    expect(again.round?.items.map((item) => item.barId)).toEqual(
      first.round?.items.map((item) => item.barId)
    )

    // Curti salva e conta; Passo some; Voltar desfaz.
    await fan().recommendations.like({ runId, barId: liked.barId })
    await fan().recommendations.dismiss({ runId, barId: passed.barId })
    const decided = await fan().recommendations.today({ where: null })
    expect(decided.round?.items[0]?.decision).toBe('liked')
    expect(decided.round?.items[1]?.decision).toBe('passed')
    const favorite = await db
      .select()
      .from(schema.userFavoriteBars)
      .where(
        and(
          eq(schema.userFavoriteBars.userId, fanId),
          eq(schema.userFavoriteBars.barId, liked.barId)
        )
      )
    expect(favorite).toHaveLength(1)

    await fan().recommendations.undo({ runId, barId: passed.barId })
    expect(
      (await fan().recommendations.today({ where: null })).round?.items[1]
        ?.decision
    ).toBeNull()
    await fan().recommendations.dismiss({ runId, barId: passed.barId })

    // Impressão nas posições 4 e 5 (a rodada do app passa de três).
    await fan().recommendations.recordImpressions({
      runId,
      items: (first.round?.items ?? []).map((item) => ({
        barId: item.barId,
        position: item.position,
        reason: item.reason,
        expandedRadius: item.isExpandedRadius
      }))
    })
    expect(
      (await fan().recommendations.today({ where: null })).round?.items.every(
        (item) => item.seen
      )
    ).toBe(true)

    // Bar de fora da rodada: Curti recusa.
    const outside = barIds.find(
      (id) => !first.round?.items.some((item) => item.barId === id)
    ) as string
    await expect(
      fan().recommendations.like({ runId, barId: outside })
    ).rejects.toThrow('Sugestão não encontrada.')

    // 10:00 em ponto: rodada nova, sem o curtido (salvo) nem o passado.
    setSystemTime(new Date('2026-10-22T13:00:00Z'))
    const next = await fan().recommendations.today({ where: ORIGIN })
    expect(next.round?.day).toBe('2026-10-22')
    expect(next.round?.runId).not.toBe(runId)
    const nextIds = next.round?.items.map((item) => item.barId) ?? []
    expect(nextIds).not.toContain(liked.barId)
    expect(nextIds).not.toContain(passed.barId)
    expect(nextIds.length).toBeLessThanOrEqual(5)
    setSystemTime()
  }
)

integrationTest('Passo tira o bar por 30 dias, não 60', async () => {
  if (!ctx) throw new Error('sem seed')
  const { db, schema, fanId, barIds } = ctx
  const { loadRecommendationCandidates } = await import(
    '../lib/recommendations/load-candidates'
  )
  const now = new Date()
  const [recent, old] = barIds.slice(6) as [string, string]
  await db.insert(schema.recommendationEvent).values([
    {
      actorUserId: fanId,
      barId: recent,
      runId: crypto.randomUUID(),
      type: 'dismiss',
      occurredAt: new Date(now.getTime() - 29 * DAY)
    },
    {
      actorUserId: fanId,
      barId: old,
      runId: crypto.randomUUID(),
      type: 'dismiss',
      occurredAt: new Date(now.getTime() - 31 * DAY)
    }
  ])
  const ids = (
    await loadRecommendationCandidates({
      userId: fanId,
      ...ORIGIN,
      radiusKm: 3,
      now
    })
  ).map((item) => item.id)
  expect(ids).not.toContain(recent)
  expect(ids).toContain(old)
})

integrationTest('Curti conta como intenção forte no ranking', async () => {
  if (!ctx) throw new Error('sem seed')
  const { db, schema, fanId, barIds } = ctx
  const { loadRecommendationCandidates } = await import(
    '../lib/recommendations/load-candidates'
  )
  const target = barIds[5] as string
  // O Curti de uma rodada, já fora dos salvos (desfavoritado há tempo).
  await db.insert(schema.recommendationEvent).values({
    actorUserId: fanId,
    barId: target,
    runId: crypto.randomUUID(),
    type: 'favorite'
  })
  const candidate = (
    await loadRecommendationCandidates({
      userId: fanId,
      ...ORIGIN,
      radiusKm: 3,
      now: new Date()
    })
  ).find((item) => item.id === target)
  expect(candidate?.intentActions.map((action) => action.kind)).toContain(
    'high_intent'
  )
})

integrationTest(
  'Avisar vira aviso quando o bar publica jogo que case; Lembrar também',
  async () => {
    if (!ctx) throw new Error('sem seed')
    const { db, schema, fan, barIds, sportId, otherSportId, fanId } = ctx
    const barId = barIds[7] as string
    const tomorrow = new Date(Date.now() + DAY)

    await fan().recommendations.setAlert({ barId, sportId, on: true })
    // Jogo de outro esporte não avisa.
    await db.insert(schema.event).values({
      barId,
      sportId: otherSportId,
      championship: 'Liga de vôlei',
      startsAt: tomorrow
    })
    expect((await fan().recommendations.notices()).alerts).toHaveLength(0)

    const [game] = await db
      .insert(schema.event)
      .values({
        barId,
        sportId,
        championship: 'Copa da rodada',
        startsAt: tomorrow
      })
      .returning({ id: schema.event.id })
    const { alerts } = await fan().recommendations.notices()
    expect(alerts.map((alert) => alert.eventId)).toEqual([game?.id as string])
    expect(alerts[0]?.sportName).toBe('Futebol da rodada')

    // Desligar o aviso tira o aviso.
    await fan().recommendations.setAlert({ barId, sportId, on: false })
    expect((await fan().recommendations.notices()).alerts).toHaveLength(0)

    await fan().recommendations.remind({
      eventId: game?.id as string,
      on: true
    })
    const { reminders } = await fan().recommendations.notices()
    expect(reminders.map((item) => item.eventId)).toEqual([game?.id as string])

    // Vou assistir com o runId da rodada vira atribuição.
    const runId = crypto.randomUUID()
    await fan().attendance.set({
      eventId: game?.id as string,
      attending: true,
      recommendationRunId: runId
    })
    const attributed = await db
      .select()
      .from(schema.recommendationEvent)
      .where(
        and(
          eq(schema.recommendationEvent.actorUserId, fanId),
          eq(schema.recommendationEvent.runId, runId),
          eq(schema.recommendationEvent.type, 'attend')
        )
      )
    expect(attributed).toHaveLength(1)
  }
)
