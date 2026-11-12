import { db, desc, eq, sql } from '@findsports_oficial/db'
import { aiRun } from '@findsports_oficial/db/schema/ai'
import { weeklyGame } from '@findsports_oficial/db/schema/weekly-games'
import { env } from '@findsports_oficial/env/server'

import { adminProcedure, router } from '../index'
import { brasiliaWindows } from '../lib/ai/limits'
import { getAppConfig } from '../lib/app-config'
import { utcIso } from '../lib/utc-timestamp'
import { brasiliaWeekOf } from '../lib/weekly-games/merge'

/*
 * A tela "Jogos da semana" do Houdini (WEB-433): o catálogo da semana como a
 * rotina gravou, com as fontes, e o gasto do mês contra o teto. Rodar e mudar
 * o teto vão pelo Bastidores (`bastidores.run`) e pelos Feitiços
 * (`weekly_games.config`), que escrevem no Grimório.
 */
export const houdiniWeeklyGamesRouter = router({
  overview: adminProcedure.query(async () => {
    const now = new Date()
    const week = brasiliaWeekOf(now)
    const window = brasiliaWindows(now)
    const [config, games, runs] = await Promise.all([
      getAppConfig('weekly_games.config'),
      db
        .select()
        .from(weeklyGame)
        .where(eq(weeklyGame.weekStart, week.monday))
        .orderBy(weeklyGame.startsAt, weeklyGame.title),
      db
        .select({
          runId: aiRun.runId,
          variant: aiRun.variant,
          status: aiRun.status,
          costUsd: aiRun.costUsd,
          tokensIn: aiRun.tokensIn,
          latencyMs: aiRun.latencyMs,
          createdAt: aiRun.createdAt
        })
        .from(aiRun)
        .where(
          sql`${aiRun.feature} = 'weekly_games' AND ${aiRun.createdAt} >= ${window.monthStart} AND ${aiRun.createdAt} < ${window.nextMonth}`
        )
        .orderBy(desc(aiRun.createdAt))
    ])
    return {
      weekStart: week.monday,
      config,
      footballData: Boolean(env.FOOTBALL_DATA_API_KEY),
      monthUsd: runs.reduce((sum, r) => sum + r.costUsd, 0),
      runs,
      games: games.map((g) => ({
        id: g.id,
        title: g.title,
        championship: g.championship,
        startsAt: utcIso(g.startsAt),
        channels: g.channels,
        channelConfirmed: g.channelConfirmed,
        matchedTeams: Boolean(g.homeTeamId && g.awayTeamId),
        sources: g.sources
      }))
    }
  })
})
