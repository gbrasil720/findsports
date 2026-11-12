import { db, type SQL, sql } from '@findsports_oficial/db'
import { utcNowSql } from '@findsports_oficial/db/event-window-sql'
import { currentClassicRulesCte, weeklyGameClassicSql } from '../classics'
import { gameTitle } from '../game-participants'
import { utcIso } from '../utc-timestamp'
import type { GameSuggestion, GameSuggestionSource } from './index'
import {
  barHistory,
  type CatalogCandidate,
  type HistoryEvent,
  rankCatalogGames
} from './rank'

/*
 * Sugestões a partir do catálogo dos jogos da semana (WEB-433): os próximos 7
 * dias de `weekly_game`, sem os que o bar já tem nem os que ele dispensou
 * ("Não passo esse"), na ordem do que combina com o bar (`rank.ts`).
 *
 * Os números de cada jogo, todos agregados:
 * - torcedores na cidade: quem favoritou um dos dois times e escolheu a
 *   cidade do bar; abaixo de 10 não sai;
 * - bares do bairro: outros bares no ar do mesmo bairro e cidade que já
 *   publicaram o jogo (mesmo início e o mesmo título ou um time em comum).
 */

const WINDOW_DAYS = 7
const HISTORY_DAYS = 56
const CANDIDATE_LIMIT = 300

/** O jogo `e` é o jogo do catálogo `w`: mesmo início e mesmo título ou time. */
const sameGame: SQL = sql`
  e.starts_at = w.starts_at AND (
    ${gameTitle({
      id: sql`e.id`,
      participantFreeText: sql`e.participant_free_text`,
      championship: sql`e.championship`
    })} = w.title
    OR EXISTS (
      SELECT 1 FROM event_participants ep
      WHERE ep.event_id = e.id AND ep.team_id IN (w.home_team_id, w.away_team_id)
    )
  )`

type CandidateRow = {
  id: string
  sport_id: string
  championship: string
  title: string
  starts_at: string | Date
  home_team_id: string | null
  away_team_id: string | null
  channels: string[]
  channel_confirmed: boolean
  fans: number
  bars: number
  classic: boolean
}

export async function readCatalogCandidates(request: {
  barId: string
  city: string
  neighborhood: string
  now: Date
}): Promise<CatalogCandidate[]> {
  const now = utcNowSql(request.now)
  const { rows } = await db.execute<CandidateRow>(sql`
    WITH ${currentClassicRulesCte}
    SELECT w.id, w.sport_id, w.championship, w.title, w.starts_at,
      w.home_team_id, w.away_team_id, w.channels, w.channel_confirmed,
      (SELECT count(DISTINCT f.user_id)::int
       FROM user_favorite_teams f
       JOIN "user" u ON u.id = f.user_id
       WHERE f.team_id IN (w.home_team_id, w.away_team_id)
         AND u.role = 'fan'
         AND search_normalize(u.search_city_name) = search_normalize(${request.city})
      ) AS fans,
      (SELECT count(DISTINCT e.bar_id)::int
       FROM event e
       JOIN bar b ON b.id = e.bar_id
       WHERE b.id <> ${request.barId}
         AND b.is_active
         AND e.published_at IS NOT NULL
         AND search_normalize(b.city) = search_normalize(${request.city})
         AND search_normalize(b.neighborhood) = search_normalize(${request.neighborhood})
         AND ${sameGame}
      ) AS bars,
      ${weeklyGameClassicSql} AS classic
    FROM weekly_game w
    WHERE w.starts_at > ${now}
      AND w.starts_at < ${now} + make_interval(days => ${WINDOW_DAYS})
      AND NOT EXISTS (
        SELECT 1 FROM bar_game_dismissal d
        WHERE d.bar_id = ${request.barId} AND d.weekly_game_id = w.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM event e WHERE e.bar_id = ${request.barId} AND ${sameGame}
      )
    ORDER BY w.starts_at, w.id
    LIMIT ${CANDIDATE_LIMIT}
  `)
  return rows.map((r) => ({
    id: r.id,
    sportId: r.sport_id,
    championship: r.championship,
    title: r.title,
    startsAt: new Date(utcIso(r.starts_at)),
    homeTeamId: r.home_team_id,
    awayTeamId: r.away_team_id,
    channels: r.channels ?? [],
    channelConfirmed: r.channel_confirmed,
    fans: r.fans,
    barsInNeighborhood: r.bars,
    classic: r.classic
  }))
}

/** Os times da casa do bar (`bar_team`), id → nome. */
export async function readHouseTeams(
  barId: string
): Promise<Map<string, string>> {
  const { rows } = await db.execute<{ id: string; name: string }>(sql`
    SELECT t.id, t.name FROM bar_team bt JOIN team t ON t.id = bt.team_id
    WHERE bt.bar_id = ${barId}
  `)
  return new Map(rows.map((r) => [r.id, r.name]))
}

/** Os jogos que o bar publicou nas últimas 8 semanas, com os times. */
export async function readBarHistory(
  barId: string,
  now: Date
): Promise<HistoryEvent[]> {
  const { rows } = await db.execute<{
    sport_id: string
    championship: string
    starts_at: string | Date
    teams: { id: string; name: string }[] | null
  }>(sql`
    SELECT e.sport_id, e.championship, e.starts_at,
      (SELECT json_agg(json_build_object('id', t.id, 'name', t.name))
       FROM event_participants ep JOIN team t ON t.id = ep.team_id
       WHERE ep.event_id = e.id) AS teams
    FROM event e
    WHERE e.bar_id = ${barId}
      AND e.published_at IS NOT NULL
      AND e.starts_at >= ${utcNowSql(now)} - make_interval(days => ${HISTORY_DAYS})
    ORDER BY e.starts_at DESC
    LIMIT 200
  `)
  return rows.map((r) => ({
    sportId: r.sport_id,
    championship: r.championship,
    startsAt: new Date(utcIso(r.starts_at)),
    teams: r.teams ?? []
  }))
}

export const catalogSource: GameSuggestionSource = {
  async suggest(request) {
    if (!request.neighborhood) return []
    const [candidates, history, houseTeams] = await Promise.all([
      readCatalogCandidates({ ...request, neighborhood: request.neighborhood }),
      readBarHistory(request.barId, request.now),
      readHouseTeams(request.barId)
    ])
    return rankCatalogGames(
      barHistory(history, houseTeams),
      candidates,
      request.limit
    ).map((game): GameSuggestion => {
      const startsAt = game.startsAt.toISOString()
      const teams =
        game.homeTeamId && game.awayTeamId
          ? [game.homeTeamId, game.awayTeamId]
          : []
      return {
        key: `${startsAt}|${game.title}`,
        title: game.title,
        sportId: game.sportId,
        championship: game.championship,
        startsAt,
        participantIds: teams,
        participantFreeText: teams.length ? null : game.title,
        channels: game.channels.length ? game.channels : null,
        channelConfirmed: game.channelConfirmed,
        fansInCity: game.fansInCity,
        barsInNeighborhood: game.barsInNeighborhood,
        reason: game.reason,
        houseTeam: game.houseTeam,
        classic: game.classic,
        featured: game.featured,
        catalogId: game.id
      }
    })
  }
}
