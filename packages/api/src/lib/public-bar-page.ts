import { db, eq, sql } from '@findsports_oficial/db'
import { BAR_REF_LENGTH, barPath } from '@findsports_oficial/db/bar-slug'
import {
  brasiliaDay,
  brasiliaDayStart,
  DEFAULT_EVENT_DURATION_INTERVAL
} from '@findsports_oficial/db/event-window'
import { bar } from '@findsports_oficial/db/schema/platform'

import { declaredAmenityIds } from './amenities'
import { getAppConfig } from './app-config'
import { readGoing } from './attendance'
import { resolvePublicGallery } from './bar-gallery'
import { resolvePublicBarMenu } from './bar-menu'
import { getCurrentPlan } from './current-plan'
import { EVENT_LIVE_WINDOW_MS } from './event-profile-window'
import { resolveEventScreen } from './event-screen'
import { byMatchOrder } from './game-participants'
import { effectiveHouseOffer } from './house-offer'
import {
  isOpenNow,
  normalizeOpeningHours,
  openingStatus
} from './opening-hours'
import { PUBLIC_BAR_COLUMNS } from './public-bar'
import {
  hasPublicRating,
  RATING_PUBLIC_FLOOR,
  ratingPercentage
} from './rating'
import { readRatingList, readReasonSummary } from './rating-list'
import { starsAverage } from './rating-review'
import { utcIso } from './utc-timestamp'

/*
 * A página pública do bar (`/bar/<slug>-<prefixo>`, decisão do dono de
 * 05/11/2026): tudo o que ela mostra a quem não entrou, lido sem sessão. O
 * que depende de quem olha (presença, código, amigos, salvo) não passa por
 * aqui: sai de `pubs.pageViewer`, só com sessão, e nunca no HTML do servidor.
 */

/**
 * O bar do prefixo do endereço (`bar-slug.ts`). `null` quando nenhum bar ou
 * mais de um começa assim: a página responde 404 nos dois casos.
 *
 * ponytail: `LIKE` sobre o texto do id varre a tabela de bares; com milhares
 * de bares é nada. Quando a coluna `slug` existir, a busca vira igualdade.
 */
export async function resolveBarRef(ref: string): Promise<string | null> {
  if (!/^[0-9a-f]{8}$/.test(ref)) return null
  const rows = await db
    .select({ id: bar.id })
    .from(bar)
    .where(sql`${bar.id} LIKE ${`${ref}-%`}`)
    .limit(2)
  return rows.length === 1 ? (rows[0]?.id ?? null) : null
}

/** O jogo como a página o lê: sem o que é da sessão. */
export type PublicGame = {
  id: string
  startsAt: Date
  endsAt: Date | null
  title: string
  championship: string
  sport: string | null
  teams: string[]
  onBigScreen: boolean
  withSound: boolean
  houseOffer: string | null
  /** `null` abaixo do piso de "Vou assistir aqui". */
  going: number | null
  attendanceEnabled: boolean
}

export type PublicBarPage =
  | { kind: 'off_air'; id: string; name: string; path: string }
  | {
      kind: 'live'
      /** O dono vendo o próprio bar fora do ar: a página sai `noindex`. */
      ownerPreview: boolean
      path: string
      bar: Omit<NonNullable<Awaited<ReturnType<typeof readLiveBar>>>, 'userId'>
    }

/** Times, senão o texto livre do bar, senão o campeonato (`formatMatchup`). */
function titleOf(game: {
  championship: string
  participantFreeText: string | null
  participants: { team: { name: string } | null }[]
}) {
  const teams = game.participants.flatMap((p) => (p.team ? [p.team.name] : []))
  if (teams.length) return teams.join(' × ')
  return game.participantFreeText || game.championship
}

async function readLiveBar(barId: string, now: Date) {
  const liveCutoff = new Date(now.getTime() - EVENT_LIVE_WINDOW_MS)
  const row = await db.query.bar.findFirst({
    where: eq(bar.id, barId),
    columns: {
      ...PUBLIC_BAR_COLUMNS,
      uf: true,
      userId: true,
      isActive: true,
      ratingCount: true,
      ratingPositive: true,
      ratingStarsCount: true,
      ratingStarsSum: true,
      houseOffer: true,
      menuUrl: true,
      averageSpendCents: true,
      openingHours: true
    },
    with: {
      subscription: {
        columns: { plan: true, status: true, currentPeriodEnd: true }
      },
      photos: {
        where: (photo, { eq }) => eq(photo.status, 'approved'),
        columns: {
          id: true,
          url: true,
          category: true,
          caption: true,
          position: true,
          status: true
        }
      },
      // A mesma janela de `pubs.getById`: o jogo ao vivo continua, rascunho
      // (WEB-436) não sai.
      events: {
        where: (game, { and, gte, isNotNull, isNull, or }) =>
          and(
            isNotNull(game.publishedAt),
            or(
              and(isNotNull(game.endsAt), gte(game.endsAt, now)),
              and(isNull(game.endsAt), gte(game.startsAt, liveCutoff))
            )
          ),
        with: {
          sport: { columns: { name: true } },
          participants: {
            with: { team: { columns: { name: true } } },
            orderBy: byMatchOrder
          }
        },
        orderBy: (game, { asc }) => [asc(game.startsAt)]
      }
    }
  })
  if (!row) return null
  const {
    userId,
    isActive,
    ratingCount,
    ratingPositive,
    ratingStarsCount,
    ratingStarsSum,
    houseOffer,
    menuUrl,
    averageSpendCents,
    openingHours,
    subscription,
    photos,
    events,
    createdAt: _c,
    updatedAt,
    ...publicBar
  } = row

  const showRating =
    (await getAppConfig('rating.public_display')) &&
    hasPublicRating(ratingCount)
  const plan = getCurrentPlan(subscription ?? null, now)
  const elite = plan === 'elite'
  const amenities = declaredAmenityIds(publicBar.amenities)
  const hours = normalizeOpeningHours(openingHours)
  // Abaixo do piso de verificadas não sai nada da nota (WEB-408, WEB-451):
  // nem %, nem estrelas, nem etiquetas, nem comentários. A mesma regra de
  // `pubs.getById`.
  const [going, reasons, reviews] = await Promise.all([
    readGoing(events.map((game) => game.id)),
    showRating ? readReasonSummary(row.id) : null,
    showRating ? readRatingList(row.id, { public: true, limit: 3 }) : []
  ])

  const games: PublicGame[] = events.map((game) => ({
    id: game.id,
    startsAt: game.startsAt,
    endsAt: game.endsAt,
    title: titleOf(game),
    championship: game.championship,
    sport: game.sport?.name ?? null,
    teams: game.participants.flatMap((p) => (p.team ? [p.team.name] : [])),
    ...resolveEventScreen(game, amenities),
    // A oferta deste jogo (WEB-422), só no Elite: é o código que a libera.
    houseOffer: elite ? effectiveHouseOffer(houseOffer, game) : null,
    going: going.get(game.id)?.count ?? null,
    attendanceEnabled: game.attendanceEnabled
  }))

  return {
    ...publicBar,
    userId,
    isActive,
    updatedAt,
    plan,
    amenities,
    issuesCode: elite,
    rating: showRating
      ? {
          total: ratingCount,
          percentage: ratingPercentage(ratingPositive, ratingCount),
          // Média das estrelas com o mesmo piso (`null` sem estrelas que
          // bastem) e quantas a formam.
          stars: starsAverage(
            ratingStarsSum,
            ratingStarsCount,
            RATING_PUBLIC_FLOOR
          ),
          starsCount: ratingStarsCount
        }
      : null,
    ratingReasons: reasons,
    // "O que dizem": os três comentários aprovados mais recentes das
    // verificadas; nome só de quem quis aparecer.
    reviews: reviews.map((review) => ({
      id: review.id,
      stars: review.stars,
      comment: review.comment,
      name: review.name,
      game: review.participants.length
        ? review.participants.join(' × ')
        : review.participantFreeText || review.championship,
      startsAt: new Date(review.startsAt)
    })),
    ...resolvePublicBarMenu(
      { menuUrl, averageSpendCents },
      subscription ?? null,
      now
    ),
    photos: resolvePublicGallery(photos, subscription ?? null, now).map(
      ({ position: _p, status: _s, ...photo }) => photo
    ),
    openingHours: hours,
    openNow: isOpenNow(hours, now),
    opening: openingStatus(hours, now),
    events: games
  }
}

/**
 * A página do bar para quem não entrou. Bar fora do ar vira `off_air` (200,
 * `noindex`), a não ser para o dono, que continua vendo a prévia. `null`: o
 * bar não existe.
 */
export async function readPublicBarPage(
  barId: string,
  { now = new Date(), viewerId = null as string | null } = {}
): Promise<PublicBarPage | null> {
  const found = await readLiveBar(barId, now)
  if (!found) return null
  const { userId, isActive, ...rest } = found
  const path = barPath(rest)
  const owner = viewerId !== null && userId === viewerId
  if (!isActive && !owner)
    return { kind: 'off_air', id: rest.id, name: rest.name, path }
  return {
    kind: 'live',
    ownerPreview: !isActive,
    path,
    bar: { ...rest, isActive }
  }
}

/**
 * "Com jogo hoje perto daqui" (estado sem jogo): até três bares no ar, a até
 * 5 km, com jogo hoje (dia de Brasília) que ainda não acabou; o mais perto
 * primeiro.
 */
export async function readNearbyGamesToday(barId: string, now = new Date()) {
  const tomorrow = brasiliaDayStart(brasiliaDay(now, 1))
  const nowUtc = sql`(${now.toISOString()}::timestamptz AT TIME ZONE 'UTC')`
  const tomorrowUtc = sql`(${tomorrow.toISOString()}::timestamptz AT TIME ZONE 'UTC')`
  const rows = await db.execute(sql`
    SELECT b.id, b.name, b.neighborhood, b.photo_url, g.title, g.starts_at, g.ends_at
    FROM bar b
    CROSS JOIN LATERAL (
      SELECT e.starts_at, e.ends_at, COALESCE(
        (SELECT string_agg(t.name, ' × ' ORDER BY ep.position, t.name)
         FROM event_participants ep JOIN team t ON t.id = ep.team_id
         WHERE ep.event_id = e.id),
        NULLIF(e.participant_free_text, ''),
        e.championship
      ) AS title
      FROM event e
      WHERE e.bar_id = b.id
        AND e.published_at IS NOT NULL
        AND e.starts_at < ${tomorrowUtc}
        AND COALESCE(e.ends_at, e.starts_at + ${DEFAULT_EVENT_DURATION_INTERVAL}::interval) > ${nowUtc}
      ORDER BY e.starts_at
      LIMIT 1
    ) g
    WHERE b.is_active
      AND b.id <> ${barId}
      -- Prefixo repetido dá 404 (resolveBarRef): não vira link aqui.
      AND NOT EXISTS (
        SELECT 1 FROM bar o
        WHERE o.id <> b.id AND left(o.id, 8) = left(b.id, 8)
      )
      AND ST_DWithin(b.geo, (SELECT geo FROM bar WHERE id = ${barId}), 5000)
    ORDER BY b.geo <-> (SELECT geo FROM bar WHERE id = ${barId})
    LIMIT 3
  `)
  return (
    rows.rows as {
      id: string
      name: string
      neighborhood: string
      photo_url: string | null
      title: string
      starts_at: string
      ends_at: string | null
    }[]
  ).map((row) => ({
    id: row.id,
    name: row.name,
    neighborhood: row.neighborhood,
    photoUrl: row.photo_url,
    path: barPath(row),
    title: row.title,
    startsAt: new Date(utcIso(row.starts_at)),
    endsAt: row.ends_at ? new Date(utcIso(row.ends_at)) : null
  }))
}

/**
 * Os bares no ar para o sitemap. Prefixo repetido fica de fora: a página
 * responde 404 para ele (`resolveBarRef`).
 */
export async function listLiveBarPaths() {
  const rows = await db
    .select({
      id: bar.id,
      name: bar.name,
      neighborhood: bar.neighborhood,
      updatedAt: bar.updatedAt,
      isActive: bar.isActive
    })
    .from(bar)
  const perRef = new Map<string, number>()
  for (const row of rows) {
    const ref = row.id.slice(0, BAR_REF_LENGTH)
    perRef.set(ref, (perRef.get(ref) ?? 0) + 1)
  }
  return rows
    .filter(
      (row) => row.isActive && perRef.get(row.id.slice(0, BAR_REF_LENGTH)) === 1
    )
    .map((row) => ({ path: barPath(row), updatedAt: row.updatedAt }))
}
