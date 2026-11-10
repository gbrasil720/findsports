import { and, db, eq, sql } from '@findsports_oficial/db'
import { brasiliaDay } from '@findsports_oficial/db/event-window'
import { gameTitle } from '@findsports_oficial/db/game-title'
import { user } from '@findsports_oficial/db/schema/auth'
import {
  sport,
  team,
  userFavoriteTeams,
  userPreferenceSports
} from '@findsports_oficial/db/schema/platform'
import { readGoing, readMyGames } from './attendance'
import {
  canSeeActivity,
  friendIdsOf,
  normalizeFriendCode,
  readFriendship,
  readMonth,
  relationOf
} from './friends'

/**
 * O convite aberto pelo link (rodada 7, tela 4): quem convidou, com a
 * carteirinha (times, o que assiste, cidade), quantos amigos tem na Onside,
 * e, para quem já tem conta, os amigos em comum e a relação. O que sai da
 * atividade (o nível, que conta as visitas, e o jogo de hoje) só aparece se a
 * privacidade de quem convidou deixa ("Onde você foi"); o jogo de hoje, além
 * disso, só para quem entrou na conta: o código do convite é curto, e sem
 * conta não se descobre onde alguém vai estar hoje.
 *
 * Os nomes dos amigos só aparecem para quem também é amigo deles (os em
 * comum); sem conta, só a contagem. A rota limita as leituras por pessoa ou
 * IP (`friends.invitePreview`).
 */
export async function readInvitePreview(
  code: string,
  viewerId: string | null,
  now = new Date()
) {
  const [inviter] = await db
    .select({
      id: user.id,
      name: user.name,
      username: user.username,
      city: user.searchCityName,
      image: user.image,
      visibility: user.activityVisibility
    })
    .from(user)
    .where(
      and(
        eq(user.friendCode, normalizeFriendCode(code)),
        sql`${user.role} = 'fan' AND ${user.banned} IS NOT TRUE`
      )
    )
  if (!inviter) return null

  const row = viewerId ? await readFriendship(viewerId, inviter.id) : null
  const relation = viewerId ? relationOf(viewerId, inviter.id, row) : 'none'

  const sees = canSeeActivity(inviter.visibility, relation)
  const [teams, sports, month, friendCount, mutual, mutualCount] =
    await Promise.all([
      db
        .select({ name: team.name, kind: team.kind })
        .from(userFavoriteTeams)
        .innerJoin(team, eq(team.id, userFavoriteTeams.teamId))
        .where(eq(userFavoriteTeams.userId, inviter.id)),
      db
        .select({ name: sport.name })
        .from(userPreferenceSports)
        .innerJoin(sport, eq(sport.id, userPreferenceSports.sportId))
        .where(eq(userPreferenceSports.userId, inviter.id)),
      sees ? readMonth(inviter.id, now) : Promise.resolve(null),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(sql`${friendIdsOf(inviter.id)} AS f(id)`),
      viewerId
        ? db
            .select({ id: user.id, name: user.name })
            .from(user)
            .where(
              sql`${user.id} IN ${friendIdsOf(inviter.id)} AND ${user.id} IN ${friendIdsOf(viewerId)}`
            )
            .limit(3)
        : Promise.resolve([]),
      viewerId
        ? db
            .select({ count: sql<number>`count(*)::int` })
            .from(user)
            .where(
              sql`${user.id} IN ${friendIdsOf(inviter.id)} AND ${user.id} IN ${friendIdsOf(viewerId)}`
            )
        : Promise.resolve([{ count: 0 }])
    ])

  // O jogo de hoje que ainda não acabou, se a privacidade deixa.
  let today = null as null | {
    eventId: string
    barId: string
    barName: string
    photoUrl: string | null
    title: string
    startsAt: string
    going: number | null
  }
  if (viewerId && sees) {
    const games = await readMyGames(inviter.id, now)
    const game = games
      .filter(
        (g) =>
          !g.ended &&
          g.barActive &&
          brasiliaDay(g.startsAt) === brasiliaDay(now)
      )
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())[0]
    if (game) {
      const going = await readGoing([game.eventId], viewerId ?? undefined)
      today = {
        eventId: game.eventId,
        barId: game.barId,
        barName: game.barName,
        photoUrl: game.photoUrl,
        title: gameTitle(game),
        startsAt: game.startsAt.toISOString(),
        going: going.get(game.eventId)?.count ?? null
      }
    }
  }

  // Já amigos: quem a pessoa conhece e você ainda não ("talvez conheça").
  const theirFriends =
    viewerId && relation === 'friends'
      ? await db
          .select({ id: user.id, name: user.name, image: user.image })
          .from(user)
          .where(
            sql`${user.id} IN ${friendIdsOf(inviter.id)}
              AND ${user.id} <> ${viewerId}
              AND ${user.id} NOT IN ${friendIdsOf(viewerId)}
              AND ${user.role} = 'fan' AND ${user.banned} IS NOT TRUE`
          )
          .limit(3)
      : []

  return {
    id: inviter.id,
    name: inviter.name,
    username: inviter.username,
    city: inviter.city,
    image: inviter.image,
    relation,
    // WEB-520: o GP da F1 vale para o aviso, não para "Torce para".
    teams: teams.filter((t) => t.kind !== 'race').map((t) => t.name),
    sports: sports.map((s) => s.name),
    level: month?.level ?? null,
    friendCount: friendCount[0]?.count ?? 0,
    mutual,
    mutualCount: mutualCount[0]?.count ?? 0,
    theirFriends,
    today
  }
}
