import { db, eq, inArray, sql } from '@findsports_oficial/db'
import { secretAchievement } from '@findsports_oficial/db/schema/achievement'
import { user } from '@findsports_oficial/db/schema/auth'
import { bar, event, sport } from '@findsports_oficial/db/schema/platform'
import { barRating } from '@findsports_oficial/db/schema/rating'
import {
  ACHIEVEMENTS,
  type AchievementId,
  computeAchievements,
  levelFor,
  type Secret,
  type Visit,
  weekStreak
} from './achievements'
import { createTtlCache } from './ttl-cache'
import { visit } from './visits'

/**
 * Leitura das conquistas (WEB-403): as visitas (`visits.ts`), uma por jogo,
 * com o bar e o esporte.
 */
export async function readVisits(userId: string) {
  return readVisitsOf([userId])
}

/** As visitas de várias pessoas numa consulta (o ranking dos amigos). */
export async function readVisitsOf(userIds: string[]) {
  return db
    .select({
      userId: visit.userId,
      // A visita é do dia do jogo, não do lançamento: o bar que confirma pela
      // comanda lança até 48 h depois (WEB-412).
      at: event.startsAt,
      eventId: event.id,
      barId: bar.id,
      barName: bar.name,
      neighborhood: bar.neighborhood,
      city: bar.city,
      // Foto e situação do bar: o perfil do amigo (`readMonth`) usa a mesma
      // leitura para os bares em comum.
      photoUrl: bar.photoUrl,
      barActive: bar.isActive,
      sportId: sport.id,
      sportName: sport.name
    })
    .from(visit)
    .innerJoin(event, eq(event.id, visit.eventId))
    .innerJoin(bar, eq(bar.id, visit.barId))
    .innerJoin(sport, eq(sport.id, event.sportId))
    .where(inArray(visit.userId, userIds))
}

export async function readReviewsOf(userIds: string[]) {
  return db
    .select({
      userId: barRating.actorUserId,
      at: barRating.createdAt,
      barName: bar.name
    })
    .from(barRating)
    .innerJoin(bar, eq(bar.id, barRating.barId))
    .where(inArray(barRating.actorUserId, userIds))
}

/** As conquistas secretas achadas (WEB-558), de várias pessoas. */
export async function readSecretsOf(
  userIds: string[]
): Promise<(Secret & { userId: string })[]> {
  if (!userIds.length) return []
  const rows = await db
    .select({
      userId: secretAchievement.userId,
      id: secretAchievement.achievementId,
      at: secretAchievement.foundAt,
      via: secretAchievement.via
    })
    .from(secretAchievement)
    .where(inArray(secretAchievement.userId, userIds))
  return rows
}

/**
 * Grava a conquista secreta uma vez só (WEB-558). Devolve se é nova: achar de
 * novo não muda a data nem abre a tela de conquista outra vez.
 */
export async function findSecret(
  userId: string,
  id: Secret['id'],
  via: 'app' | 'web'
) {
  const inserted = await db
    .insert(secretAchievement)
    .values({ userId, achievementId: id, via })
    .onConflictDoNothing()
    .returning({ at: secretAchievement.foundAt })
  // A fatia de quem tem (2j) muda com a primeira de cada um.
  if (inserted.length) shareCache.clear()
  return { isNew: inserted.length > 0 }
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
      userId: visit.userId,
      bars: sql<number>`count(distinct ${visit.barId})::int`.as('bars'),
      bairros:
        sql<number>`count(distinct (${bar.city}, ${bar.neighborhood}))::int`.as(
          'bairros'
        ),
      esportes: sql<number>`count(distinct ${event.sportId})::int`.as(
        'esportes'
      )
    })
    .from(visit)
    .innerJoin(event, eq(event.id, visit.eventId))
    .innerJoin(bar, eq(bar.id, visit.barId))
    .groupBy(visit.userId)
    .as('visits')
  const reviews = db
    .select({
      userId: barRating.actorUserId,
      resenhas: sql<number>`count(*)::int`.as('resenhas')
    })
    .from(barRating)
    .groupBy(barRating.actorUserId)
    .as('reviews')
  const [fans, rows, secrets] = await Promise.all([
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
      .fullJoin(reviews, eq(reviews.userId, visits.userId)),
    db
      .select({
        id: secretAchievement.achievementId,
        count: sql<number>`count(*)::int`
      })
      .from(secretAchievement)
      .groupBy(secretAchievement.achievementId)
  ])
  const total = fans[0]?.count ?? 0
  return Object.fromEntries(
    ACHIEVEMENTS.map((a) => {
      const have =
        a.group === 'segredos'
          ? (secrets.find((r) => r.id === a.id)?.count ?? 0)
          : rows.filter((r) => r[a.group] >= a.target).length
      return [a.id, sharePercent(have, total)]
    })
  ) as Record<AchievementId, number>
}

/** Arredonda, mas quem tem a medalha nunca vira 0%. */
export function sharePercent(have: number, total: number) {
  if (!have || !total) return 0
  return Math.max(1, Math.round((have / total) * 100))
}

/** `visits` vem pronta quando quem chama já leu as visitas (`readMonth`). */
export async function readAchievements(
  userId: string,
  visits: Promise<Visit[]> = readVisits(userId)
) {
  const [visitRows, reviews, secrets, shares] = await Promise.all([
    visits,
    readReviewsOf([userId]),
    readSecretsOf([userId]),
    shareCache.get('all', readShares)
  ])
  const achievements = computeAchievements(visitRows, reviews, secrets).map(
    (a) => ({
      ...a,
      // A secreta bloqueada não diz o que é (WEB-558).
      name:
        a.group === 'segredos' && !a.unlockedAt ? 'Conquista secreta' : a.name,
      share: shares[a.id]
    })
  )
  return {
    level: levelFor(achievements.filter((a) => a.unlockedAt).length),
    /** Semanas seguidas com visita (rodada 6, o placar do nível). */
    streak: weekStreak(visitRows, new Date()),
    achievements
  }
}
