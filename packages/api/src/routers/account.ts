import { db, eq, sql } from '@findsports_oficial/db'
import { attendanceReport } from '@findsports_oficial/db/schema/attendance'
import { user } from '@findsports_oficial/db/schema/auth'
import {
  bar,
  event,
  sport,
  team,
  userFavoriteBars,
  userFavoriteTeams,
  userPreferenceSports
} from '@findsports_oficial/db/schema/platform'
import { barRating } from '@findsports_oficial/db/schema/rating'
import { friendship } from '@findsports_oficial/db/schema/social'
import { fanProcedure, router } from '../index'
import { readAchievements } from '../lib/achievements-read'
import { readMyGames } from '../lib/attendance'

/*
 * "Baixar meus dados" (Privacidade, 11i do design; WEB-419). O app grava o
 * JSON num arquivo e entrega pelo share sheet do sistema. Só sai o que é da
 * própria conta: de outra pessoa, só o nome e o `@` de quem é seu amigo ou
 * trocou pedido com você, que a pessoa já vê na tela de amigos.
 */

const iso = (date: Date | null) => date?.toISOString() ?? null

export const accountRouter = router({
  exportData: fanProcedure.query(async ({ ctx }) => {
    const me = ctx.session.user.id
    const [
      [profile],
      sports,
      teams,
      favorites,
      games,
      reports,
      ratings,
      friends,
      achievements
    ] = await Promise.all([
      db
        .select({
          id: user.id,
          name: user.name,
          email: user.email,
          emailVerified: user.emailVerified,
          image: user.image,
          username: user.username,
          friendCode: user.friendCode,
          city: user.searchCityName,
          uf: user.searchCityUf,
          searchRadiusKm: user.searchRadiusKm,
          activityVisibility: user.activityVisibility,
          friendRequestsFrom: user.friendRequestsFrom,
          twoFactorEnabled: user.twoFactorEnabled,
          createdAt: user.createdAt
        })
        .from(user)
        .where(eq(user.id, me)),
      db
        .select({ name: sport.name })
        .from(userPreferenceSports)
        .innerJoin(sport, eq(sport.id, userPreferenceSports.sportId))
        .where(eq(userPreferenceSports.userId, me))
        .orderBy(sport.name),
      db
        .select({ name: team.name, sport: sport.name })
        .from(userFavoriteTeams)
        .innerJoin(team, eq(team.id, userFavoriteTeams.teamId))
        .innerJoin(sport, eq(sport.id, userFavoriteTeams.sportId))
        .where(eq(userFavoriteTeams.userId, me))
        .orderBy(team.name),
      db
        .select({
          bar: bar.name,
          neighborhood: bar.neighborhood,
          city: bar.city,
          savedAt: userFavoriteBars.createdAt
        })
        .from(userFavoriteBars)
        .innerJoin(bar, eq(bar.id, userFavoriteBars.barId))
        .where(eq(userFavoriteBars.userId, me))
        .orderBy(sql`${userFavoriteBars.createdAt} desc`),
      readMyGames(me),
      db
        .select({
          eventId: attendanceReport.eventId,
          attended: attendanceReport.attended
        })
        .from(attendanceReport)
        .where(eq(attendanceReport.userId, me)),
      db
        .select({
          bar: bar.name,
          championship: event.championship,
          startsAt: event.startsAt,
          wouldReturn: barRating.wouldReturn,
          createdAt: barRating.createdAt
        })
        .from(barRating)
        .innerJoin(bar, eq(bar.id, barRating.barId))
        .innerJoin(event, eq(event.id, barRating.eventId))
        .where(eq(barRating.actorUserId, me))
        .orderBy(sql`${barRating.createdAt} desc`),
      db
        .select({
          name: user.name,
          username: user.username,
          requestedByMe: sql<boolean>`${friendship.requesterId} = ${me}`,
          since: friendship.createdAt,
          acceptedAt: friendship.acceptedAt
        })
        .from(friendship)
        .innerJoin(
          user,
          sql`${user.id} = CASE WHEN ${friendship.requesterId} = ${me}
            THEN ${friendship.addresseeId} ELSE ${friendship.requesterId} END`
        )
        .where(
          sql`${friendship.requesterId} = ${me} OR ${friendship.addresseeId} = ${me}`
        )
        .orderBy(user.name),
      readAchievements(me)
    ])
    const went = new Map(reports.map((r) => [r.eventId, r.attended]))
    return {
      exportedAt: new Date().toISOString(),
      profile: profile
        ? { ...profile, createdAt: iso(profile.createdAt) }
        : null,
      preferences: {
        sports: sports.map((s) => s.name),
        teams
      },
      favoriteBars: favorites.map((f) => ({ ...f, savedAt: iso(f.savedAt) })),
      games: games.map((game) => ({
        bar: game.barName,
        neighborhood: game.neighborhood,
        championship: game.championship,
        participants: game.participants.length
          ? game.participants
          : game.participantFreeText,
        startsAt: iso(game.startsAt),
        code: game.code,
        validated: game.validated,
        offer: game.offer,
        // "Você foi?" do pós-jogo; `null` sem resposta.
        attended: went.get(game.eventId) ?? null
      })),
      ratings: ratings.map((r) => ({
        ...r,
        startsAt: iso(r.startsAt),
        createdAt: iso(r.createdAt)
      })),
      friends: friends.map((f) => ({
        name: f.name,
        username: f.username,
        status: f.acceptedAt
          ? 'friends'
          : f.requestedByMe
            ? 'request_sent'
            : 'request_received',
        since: iso(f.acceptedAt ?? f.since)
      })),
      achievements: {
        level: achievements.level.level,
        levelName: achievements.level.name,
        unlocked: achievements.achievements
          .filter((a) => a.unlockedAt)
          .map((a) => ({
            id: a.id,
            name: a.name,
            unlockedAt: iso(a.unlockedAt ? new Date(a.unlockedAt) : null)
          }))
      }
    }
  })
})
