import { and, db, eq, sql } from '@findsports_oficial/db'
import { recommendationRound } from '@findsports_oficial/db/schema/recommendation'
import {
  clampSearchRadiusKm,
  SEARCH_RADIUS_MAX_KM
} from '@findsports_oficial/db/search-radius'

import { readGoing } from '../attendance'
import { participantNames } from '../game-participants'
import { utcIso } from '../utc-timestamp'
import { loadRecommendationFacts } from './facts'
import { loadRecommendationCandidates } from './load-candidates'
import { RECOMMENDATION_SLOTS, rankRecommendations } from './ranking'
import {
  nextRoundAt,
  ROUND_SIZE,
  type RoundDecision,
  type RoundItem,
  roundDay
} from './round'

/*
 * Leitura e gravação da rodada diária "Bares pra você" (WEB-425). A rodada
 * nasce na primeira leitura do dia com localização e fica gravada: o limite de
 * cinco bares por dia vale aqui, no servidor. Jogo, presença, aviso e
 * lembrete são lidos ao vivo a cada leitura.
 */

type Where = { lat: number; lng: number }

/** Ranqueia `count` bares a partir de `where`, fora os já na rodada. */
async function rankItems(input: {
  userId: string
  where: Where
  radiusKm: number
  userRadiusKm: number
  now: Date
  exclude: string[]
  firstPosition: number
}): Promise<RoundItem[]> {
  const count = ROUND_SIZE - input.firstPosition + 1
  if (count <= 0) return []
  const candidates = await loadRecommendationCandidates({
    userId: input.userId,
    ...input.where,
    radiusKm: input.radiusKm,
    now: input.now,
    excludeBarIds: input.exclude
  })
  const ranked = rankRecommendations(
    candidates,
    { now: input.now, radiusKm: input.radiusKm },
    count
  )
  const facts = await loadRecommendationFacts({
    userId: input.userId,
    items: ranked,
    now: input.now
  })
  return ranked.map((item, index) => {
    const position = input.firstPosition + index
    return {
      barId: item.bar.id,
      name: item.bar.name,
      neighborhood: item.bar.neighborhood,
      photoUrl: item.bar.photoUrl,
      latitude: item.bar.latitude,
      longitude: item.bar.longitude,
      distanceKm: item.bar.distanceKm,
      position,
      // A posição decide o selo ("Sua cara", "Pra variar"...), também nos
      // bares que entram depois, ao ampliar o raio.
      slot: RECOMMENDATION_SLOTS[position - 1]?.slot ?? item.slot,
      score: item.score,
      axes: item.axes,
      reason: item.reason,
      // "Fora do seu raio" é em relação ao raio do perfil, mesmo ampliado.
      isExpandedRadius: item.bar.distanceKm > input.userRadiusKm,
      facts: facts.get(item.bar.id) as RoundItem['facts']
    }
  })
}

async function readRound(userId: string, day: string) {
  const [row] = await db
    .select()
    .from(recommendationRound)
    .where(
      and(
        eq(recommendationRound.actorUserId, userId),
        eq(recommendationRound.day, day)
      )
    )
  return row ? { ...row, items: row.items as unknown as RoundItem[] } : null
}

/** A rodada de hoje; cria com `where` se ainda não existe. */
export async function readOrCreateRound(input: {
  userId: string
  userRadiusKm: number | null | undefined
  where: Where | null
  now: Date
}) {
  const day = roundDay(input.now)
  const existing = await readRound(input.userId, day)
  if (existing || !input.where) return existing
  const radiusKm = clampSearchRadiusKm(input.userRadiusKm, 3)
  const items = await rankItems({
    userId: input.userId,
    where: input.where,
    radiusKm,
    userRadiusKm: radiusKm,
    now: input.now,
    exclude: [],
    firstPosition: 1
  })
  // Duas aberturas ao mesmo tempo: a segunda perde e lê a da primeira.
  await db
    .insert(recommendationRound)
    .values({
      runId: crypto.randomUUID(),
      actorUserId: input.userId,
      day,
      radiusKm,
      items
    })
    .onConflictDoNothing()
  return readRound(input.userId, day)
}

/** Completa a rodada curta até cinco, com outro raio (23h, 23i). */
export async function refillRound(input: {
  userId: string
  userRadiusKm: number | null | undefined
  where: Where
  radiusKm: number
  now: Date
}) {
  const round = await readRound(input.userId, roundDay(input.now))
  if (!round || round.items.length >= ROUND_SIZE) return round
  const radiusKm = clampSearchRadiusKm(input.radiusKm, round.radiusKm)
  const added = await rankItems({
    userId: input.userId,
    where: input.where,
    radiusKm,
    userRadiusKm: clampSearchRadiusKm(input.userRadiusKm, 3),
    now: input.now,
    exclude: round.items.map((item) => item.barId),
    firstPosition: round.items.length + 1
  })
  if (added.length === 0) return round
  await db
    .update(recommendationRound)
    .set({ items: [...round.items, ...added], radiusKm })
    .where(eq(recommendationRound.runId, round.runId))
  return readRound(input.userId, round.day)
}

/**
 * "Ampliar para 10 km · +6 bares" (23h, 23i): quantos bares a mais a rodada
 * ganharia com o dobro do raio, e os esportes com jogo ali que a pessoa não
 * marcou ("Incluir vôlei e MMA").
 */
export async function readExpansion(input: {
  userId: string
  where: Where
  radiusKm: number
  exclude: string[]
  now: Date
}) {
  const radiusKm = Math.min(SEARCH_RADIUS_MAX_KM, input.radiusKm * 2)
  if (radiusKm <= input.radiusKm) return null
  const [candidates, sports] = await Promise.all([
    loadRecommendationCandidates({
      userId: input.userId,
      ...input.where,
      radiusKm,
      now: input.now,
      excludeBarIds: input.exclude
    }),
    db.execute(sql`
      SELECT s.id, s.name
      FROM event e
      JOIN bar b ON b.id = e.bar_id
      JOIN sport s ON s.id = e.sport_id
      WHERE b.is_active
        AND e.starts_at >= ${input.now}
        AND e.starts_at < ${input.now}::timestamp + INTERVAL '14 days'
        AND ST_DWithin(
          b.geo,
          ST_SetSRID(ST_MakePoint(${input.where.lng}, ${input.where.lat}), 4326)::geography,
          ${radiusKm * 1000}
        )
        AND NOT EXISTS (
          SELECT 1 FROM user_preference_sports ups
          WHERE ups.user_id = ${input.userId} AND ups.sport_id = s.id
        )
      GROUP BY s.id, s.name
      ORDER BY COUNT(*) DESC, s.name
      LIMIT 2
    `)
  ])
  return {
    radiusKm,
    bars: candidates.filter((bar) => bar.distanceKm <= radiusKm).length,
    sports: sports.rows as { id: string; name: string }[]
  }
}

type GameRow = {
  id: string
  bar_id: string
  starts_at: string
  championship: string
  participant_free_text: string | null
  participants: string[]
  sport_id: string
  sport_name: string
}

/** A rodada com o que muda ao longo do dia: decisões, jogo, presença. */
export async function hydrateRound(
  userId: string,
  round: NonNullable<Awaited<ReturnType<typeof readRound>>>,
  now: Date
) {
  const ids = JSON.stringify(round.items.map((item) => item.barId))
  const [games, events, alerts] = await Promise.all([
    db.execute(sql`
      SELECT DISTINCT ON (e.bar_id)
        e.id, e.bar_id, e.starts_at, e.championship, e.participant_free_text,
        ${participantNames(sql`e.id`)} AS participants,
        s.id AS sport_id, s.name AS sport_name
      FROM event e
      JOIN sport s ON s.id = e.sport_id
      WHERE e.bar_id IN (SELECT jsonb_array_elements_text(${ids}::jsonb))
        AND e.starts_at > ${now}
      ORDER BY e.bar_id, e.starts_at, e.id
    `),
    db.execute(sql`
      SELECT bar_id, type FROM recommendation_event
      WHERE actor_user_id = ${userId}
        AND run_id = ${round.runId}
        AND type IN ('impression', 'favorite', 'dismiss')
    `),
    db.execute(sql`
      SELECT bar_id, sport_id, team_id FROM bar_game_alert
      WHERE user_id = ${userId}
        AND bar_id IN (SELECT jsonb_array_elements_text(${ids}::jsonb))
    `)
  ])
  const gameRows = games.rows as GameRow[]
  const eventIds = gameRows.map((game) => game.id)
  const eventList = JSON.stringify(eventIds)
  const [going, mine] = await Promise.all([
    readGoing(eventIds, userId),
    eventIds.length
      ? db.execute(sql`
          SELECT event_id, 'attend' AS kind FROM attendance
          WHERE user_id = ${userId}
            AND event_id IN (SELECT jsonb_array_elements_text(${eventList}::jsonb))
          UNION ALL
          SELECT event_id, 'remind' AS kind FROM game_reminder
          WHERE user_id = ${userId}
            AND event_id IN (SELECT jsonb_array_elements_text(${eventList}::jsonb))
        `)
      : Promise.resolve({ rows: [] })
  ])
  const eventRows = events.rows as { bar_id: string; type: string }[]
  const has = (barId: string, type: string) =>
    eventRows.some((row) => row.bar_id === barId && row.type === type)
  const mineRows = mine.rows as { event_id: string; kind: string }[]
  const alertRows = alerts.rows as {
    bar_id: string
    sport_id: string | null
    team_id: string | null
  }[]

  return {
    runId: round.runId,
    day: round.day,
    nextRoundAt: nextRoundAt(now).toISOString(),
    radiusKm: round.radiusKm,
    items: round.items.map((item) => {
      const game = gameRows.find((row) => row.bar_id === item.barId)
      const decision: RoundDecision = has(item.barId, 'favorite')
        ? 'liked'
        : has(item.barId, 'dismiss')
          ? 'passed'
          : null
      return {
        ...item,
        decision,
        seen: has(item.barId, 'impression'),
        game: game
          ? {
              id: game.id,
              startsAt: utcIso(game.starts_at),
              championship: game.championship,
              participantFreeText: game.participant_free_text,
              participants: game.participants,
              sport: { id: game.sport_id, name: game.sport_name },
              // Amigos que vão pelo nome (WEB-404), pela privacidade de cada um.
              going: going.get(game.id) ?? null,
              attending: mineRows.some(
                (row) => row.event_id === game.id && row.kind === 'attend'
              ),
              reminded: mineRows.some(
                (row) => row.event_id === game.id && row.kind === 'remind'
              )
            }
          : null,
        alerts: {
          sportIds: alertRows
            .filter((row) => row.bar_id === item.barId && row.sport_id)
            .map((row) => row.sport_id as string),
          teamIds: alertRows
            .filter((row) => row.bar_id === item.barId && row.team_id)
            .map((row) => row.team_id as string)
        }
      }
    })
  }
}

export async function readTodayRound(userId: string, now: Date) {
  return readRound(userId, roundDay(now))
}
