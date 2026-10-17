import { and, db, eq, isNull, sql } from '@findsports_oficial/db'
import { user } from '@findsports_oficial/db/schema/auth'
import { bar, event, sport } from '@findsports_oficial/db/schema/platform'
import { barRating } from '@findsports_oficial/db/schema/rating'
import {
  reservation,
  reservationCode,
  reservationCodeUse
} from '@findsports_oficial/db/schema/reservation'
import {
  ACHIEVEMENTS,
  type AchievementId,
  computeAchievements,
  levelFor
} from './achievements'
import { createTtlCache } from './ttl-cache'

/**
 * Leitura das conquistas (WEB-403). A visita é o código validado no balcão e
 * não desfeito: o ingresso mora em `reservation`/`reservation_code`
 * (`attendance-ticket.ts`). Com o check-in por localização (WEB-408), as
 * visitas dele entram aqui também.
 */
async function readVisits(userId: string) {
  return db
    .select({
      at: reservationCodeUse.usedAt,
      barId: bar.id,
      barName: bar.name,
      neighborhood: bar.neighborhood,
      city: bar.city,
      sportId: sport.id,
      sportName: sport.name
    })
    .from(reservationCodeUse)
    .innerJoin(
      reservationCode,
      eq(reservationCode.id, reservationCodeUse.codeId)
    )
    .innerJoin(reservation, eq(reservation.id, reservationCode.reservationId))
    .innerJoin(event, eq(event.id, reservation.eventId))
    .innerJoin(bar, eq(bar.id, event.barId))
    .innerJoin(sport, eq(sport.id, event.sportId))
    .where(
      and(eq(reservation.userId, userId), isNull(reservationCodeUse.undoneAt))
    )
}

async function readReviews(userId: string) {
  return db
    .select({ at: barRating.createdAt, barName: bar.name })
    .from(barRating)
    .innerJoin(bar, eq(bar.id, barRating.barId))
    .where(eq(barRating.actorUserId, userId))
}

/**
 * "Têm essa N% dos torcedores" (2j): para cada medalha, a fatia das contas de
 * torcedor que já chegou ao alvo. É agregado de todo mundo, igual para
 * qualquer um, e por isso cabe no cache global.
 *
 * ponytail: traz uma linha por torcedor com visita ou avaliação e conta em
 * memória; com muitos milhares, vira contagem com `filter` no SQL.
 */
const shareCache = createTtlCache<Record<AchievementId, number>>({
  ttlMs: 10 * 60 * 1000,
  maxEntries: 1
})

async function readShares() {
  const visits = db
    .select({
      userId: reservation.userId,
      bars: sql<number>`count(distinct ${event.barId})::int`.as('bars'),
      bairros:
        sql<number>`count(distinct (${bar.city}, ${bar.neighborhood}))::int`.as(
          'bairros'
        ),
      esportes: sql<number>`count(distinct ${event.sportId})::int`.as(
        'esportes'
      )
    })
    .from(reservationCodeUse)
    .innerJoin(
      reservationCode,
      eq(reservationCode.id, reservationCodeUse.codeId)
    )
    .innerJoin(reservation, eq(reservation.id, reservationCode.reservationId))
    .innerJoin(event, eq(event.id, reservation.eventId))
    .innerJoin(bar, eq(bar.id, event.barId))
    .where(isNull(reservationCodeUse.undoneAt))
    .groupBy(reservation.userId)
    .as('visits')
  const reviews = db
    .select({
      userId: barRating.actorUserId,
      resenhas: sql<number>`count(*)::int`.as('resenhas')
    })
    .from(barRating)
    .groupBy(barRating.actorUserId)
    .as('reviews')
  const [fans, rows] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(user)
      .where(eq(user.role, 'fan')),
    db
      .select({
        bares: sql<number>`coalesce(${visits.bars}, 0)`,
        bairros: sql<number>`coalesce(${visits.bairros}, 0)`,
        esportes: sql<number>`coalesce(${visits.esportes}, 0)`,
        resenhas: sql<number>`coalesce(${reviews.resenhas}, 0)`
      })
      .from(visits)
      .fullJoin(reviews, eq(reviews.userId, visits.userId))
  ])
  const total = fans[0]?.count ?? 0
  return Object.fromEntries(
    ACHIEVEMENTS.map((a) => {
      const have = rows.filter((r) => r[a.group] >= a.target).length
      return [a.id, sharePercent(have, total)]
    })
  ) as Record<AchievementId, number>
}

/** Arredonda, mas quem tem a medalha nunca vira 0%. */
export function sharePercent(have: number, total: number) {
  if (!have || !total) return 0
  return Math.max(1, Math.round((have / total) * 100))
}

export async function readAchievements(userId: string) {
  const [visits, reviews, shares] = await Promise.all([
    readVisits(userId),
    readReviews(userId),
    shareCache.get('all', readShares)
  ])
  const achievements = computeAchievements(visits, reviews).map((a) => ({
    ...a,
    share: shares[a.id]
  }))
  return {
    level: levelFor(achievements.filter((a) => a.unlockedAt).length),
    achievements
  }
}
