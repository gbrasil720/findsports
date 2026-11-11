import { db, sql } from '@findsports_oficial/db'
import {
  BRASILIA_TIME_ZONE,
  brasiliaDayStart
} from '@findsports_oficial/db/event-window'

import { declaredAmenityIds } from './amenities'
import { getAppConfig } from './app-config'
import { readGoing } from './attendance'
import { classicRuleLateral, currentClassicRulesCte } from './classics'
import { getCurrentPlan, type SubscriptionForPlan } from './current-plan'
import { resolveEventScreen } from './event-screen'
import { gameTitle } from './game-participants'
import { effectiveHouseOffer } from './house-offer'
import { normalizeOpeningHours, type OpeningHours } from './opening-hours'
import { hasPublicRating, RATING_PUBLIC_FLOOR } from './rating'
import { starsAverage } from './rating-review'
import { createTtlCache } from './ttl-cache'
import { utcIso } from './utc-timestamp'

/*
 * A régua do Explorar do web do torcedor (WEB-501, protótipo
 * `docs/design/redesign-2026-11/torcedor`): os jogos de um dia (o de
 * Brasília) nos bares no ar perto de um ponto, cada um com os bares que o
 * passam. A busca começa pelo jogo: a régua escolhe o jogo, a lista mostra
 * onde ele passa. Aberta, como a busca para quem não entrou: nada da sessão
 * entra aqui, e o que sai é o que a página pública do bar já mostra.
 *
 * O mesmo jogo em vários bares é um jogo só: mesmo título e mesmo início,
 * como em `pubs.todayGames`.
 */

/** Teto de linhas (jogo × bar) num dia; a régua é de um raio de bairro. */
const BOARD_LIMIT = 400

export type BoardInput = {
  lat: number
  lng: number
  radiusKm: number
  /** `AAAA-MM-DD`, dia de Brasília. */
  day: string
}

type BoardRow = {
  event_id: string
  bar_id: string
  starts_at: string
  ends_at: string | null
  championship: string
  sport_slug: string
  sport_name: string
  title: string
  on_big_screen: boolean | null
  with_sound: boolean | null
  event_offer: string | null
  no_house_offer: boolean
  attendance_enabled: boolean
  name: string
  neighborhood: string
  photo_url: string | null
  latitude: string
  longitude: string
  amenities: number[]
  bar_offer: string | null
  rating_count: number
  rating_stars_count: number
  rating_stars_sum: number
  opening_hours: OpeningHours | null
  plan: SubscriptionForPlan['plan'] | null
  plan_status: SubscriptionForPlan['status'] | null
  current_period_end: string | null
  distance_km: number
  weekday: number
  classic_rule_reason: string | null
  classic_rule_version: number | null
}

const cache = createTtlCache<BoardRow[]>({
  ttlMs: 60_000,
  maxEntries: 200
})

function readRows(input: BoardInput) {
  const start = brasiliaDayStart(input.day).toISOString()
  const origin = sql`ST_SetSRID(ST_MakePoint(${input.lng}, ${input.lat}), 4326)::geography`
  // `starts_at` é `timestamp` sem fuso, em UTC: o ISO com `Z` vira a mesma
  // hora sem fuso no `::timestamp`.
  return db
    .execute<BoardRow>(sql`
      WITH ${currentClassicRulesCte}
      SELECT
        e.id AS event_id, e.bar_id, e.starts_at, e.ends_at, e.championship,
        s.slug AS sport_slug, s.name AS sport_name,
        ${gameTitle({
          id: sql`e.id`,
          participantFreeText: sql`e.participant_free_text`,
          championship: sql`e.championship`
        })} AS title,
        e.on_big_screen, e.with_sound,
        e.house_offer AS event_offer, e.no_house_offer, e.attendance_enabled,
        b.name, b.neighborhood, b.photo_url, b.latitude, b.longitude,
        b.amenities, b.house_offer AS bar_offer, b.rating_count,
        b.rating_stars_count, b.rating_stars_sum, b.opening_hours,
        sub.plan, sub.status AS plan_status, sub.current_period_end,
        ST_Distance(b.geo, ${origin}) / 1000 AS distance_km,
        classic.classic_rule_reason, classic.classic_rule_version,
        EXTRACT(DOW FROM (e.starts_at AT TIME ZONE 'UTC') AT TIME ZONE ${BRASILIA_TIME_ZONE})::int AS weekday
      FROM event e
      JOIN bar b ON b.id = e.bar_id
      JOIN sport s ON s.id = e.sport_id
      LEFT JOIN subscription sub ON sub.bar_id = b.id
      ${classicRuleLateral(sql`e`)}
      WHERE b.is_active
        AND e.published_at IS NOT NULL
        AND e.starts_at >= ${start}::timestamp
        AND e.starts_at < ${start}::timestamp + interval '1 day'
        AND ST_DWithin(b.geo, ${origin}, ${input.radiusKm * 1000})
      ORDER BY e.starts_at, distance_km, e.id
      LIMIT ${BOARD_LIMIT}
    `)
    .then((result) => result.rows)
}

export type BoardBar = Awaited<
  ReturnType<typeof readGameBoard>
>['games'][number]['bars'][number]

export async function readGameBoard(input: BoardInput, now = new Date()) {
  const key = `${input.day}:${input.radiusKm}:${input.lat.toFixed(3)}:${input.lng.toFixed(3)}`
  const [rows, ratingPublic] = await Promise.all([
    cache.get(key, () => readRows(input)),
    getAppConfig('rating.public_display')
  ])
  // A contagem de quem vai muda a cada marcação: fica fora do cache.
  const going = await readGoing(rows.map((row) => row.event_id))

  const games = new Map<
    string,
    {
      key: string
      title: string
      championship: string
      sport: { slug: string; name: string }
      startsAt: string
      endsAt: string | null
      bars: ReturnType<typeof toBar>[]
    }
  >()

  function toBar(row: BoardRow) {
    const elite =
      getCurrentPlan(
        row.plan && row.plan_status
          ? {
              plan: row.plan,
              status: row.plan_status,
              currentPeriodEnd: row.current_period_end
                ? new Date(utcIso(row.current_period_end))
                : null
            }
          : null,
        now
      ) === 'elite'
    const amenities = declaredAmenityIds(row.amenities ?? [])
    const showRating = ratingPublic && hasPublicRating(row.rating_count)
    const hours = normalizeOpeningHours(row.opening_hours)
    const vao = going.get(row.event_id)
    return {
      eventId: row.event_id,
      barId: row.bar_id,
      name: row.name,
      neighborhood: row.neighborhood,
      photoUrl: row.photo_url,
      latitude: Number(row.latitude),
      longitude: Number(row.longitude),
      distanceKm: Number(row.distance_km),
      elite,
      amenities,
      ...resolveEventScreen(
        { onBigScreen: row.on_big_screen, withSound: row.with_sound },
        amenities
      ),
      // A oferta e o código do balcão são do Elite (WEB-131, WEB-422).
      offer: elite
        ? effectiveHouseOffer(row.bar_offer, {
            houseOffer: row.event_offer,
            noHouseOffer: row.no_house_offer
          })
        : null,
      rating: showRating
        ? {
            total: row.rating_count,
            stars: starsAverage(
              row.rating_stars_sum,
              row.rating_stars_count,
              RATING_PUBLIC_FLOOR
            )
          }
        : null,
      closes: hours?.[row.weekday]?.closes ?? null,
      attendanceEnabled: row.attendance_enabled,
      // Clássico do jogo (WEB-130): o Elite vai na frente e a tela registra a
      // entrega (`classic_exposure`, `classic_click`), como na busca.
      classic:
        row.classic_rule_reason && row.classic_rule_version != null
          ? {
              reason: row.classic_rule_reason,
              ruleVersion: Number(row.classic_rule_version)
            }
          : null,
      // Sem `viewerId`, só entra o jogo que passou do piso: a contagem nunca
      // vem nula aqui; o filtro deixa isso explícito para o tipo.
      going:
        vao && vao.count !== null
          ? { count: vao.count, initials: vao.initials }
          : null
    }
  }

  for (const row of rows) {
    const startsAt = utcIso(row.starts_at)
    const key = `${startsAt}|${row.title}`
    let game = games.get(key)
    if (!game) {
      game = {
        key,
        title: row.title,
        championship: row.championship,
        sport: { slug: row.sport_slug, name: row.sport_name },
        startsAt,
        endsAt: row.ends_at ? utcIso(row.ends_at) : null,
        bars: []
      }
      games.set(key, game)
    }
    // Um bar com o mesmo jogo duas vezes conta uma.
    if (!game.bars.some((bar) => bar.barId === row.bar_id)) {
      game.bars.push(toBar(row))
    }
  }

  return { day: input.day, games: [...games.values()] }
}
