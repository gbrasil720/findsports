import { and, db, eq, sql } from '@findsports_oficial/db'
import { fold } from '@findsports_oficial/db/catalog/fold'
import { brasiliaDay } from '@findsports_oficial/db/event-window'
import { utcNowSql } from '@findsports_oficial/db/event-window-sql'
import {
  type WeeklyGameSource,
  weeklyGame
} from '@findsports_oficial/db/schema/weekly-games'
import { env } from '@findsports_oficial/env/server'

import { aiGatewayId, cloudflareApiToken, getAiBinding } from '../ai/binding'
import { brasiliaWindows } from '../ai/limits'
import { costUsd } from '../ai/models'
import { readUsage, runAi } from '../ai/run'
import { getAppConfig } from '../app-config'
import {
  BudgetStop,
  brasiliaStart,
  brasiliaWeekOf,
  createBudget,
  dayMonth,
  type FoundGame,
  gameKey,
  type MergedGame,
  markConfirmation,
  mergeGames,
  splitSides
} from './merge'
import {
  BROWSER_USD_PER_MS,
  BROWSER_WORST_USD,
  type Cloudflare,
  EXTRACTION_MODEL,
  extractionInput,
  footballDataCodes,
  footballDataFixtures,
  MAX_OUT_TOKENS,
  parseExtraction,
  readPage,
  SEARCH_USD,
  webSearch
} from './sources'

/*
 * A rotina `weekly_games` (WEB-433). Segunda: monta o catálogo da semana
 * (segunda a domingo de Brasília) para os campeonatos que os bares passam.
 * Quinta: procura de novo o canal dos jogos que ficaram sem. Tudo numa linha
 * de `ai_run` (feature `weekly_games`), com buscas e páginas somadas ao custo
 * do modelo, e parando antes de passar do teto do mês
 * (`weekly_games.config`).
 */

/** Campeonatos por segunda: o protótipo mediu ~US$ 0,21 com 15. */
const MAX_CHAMPIONSHIPS = 15
const PAGES_PER_CHAMPIONSHIP = 2
/** Buscas "onde assistir" de jogo sem canal por execução. */
const MAX_FOLLOWUPS = 12
/** Escopo: o que algum bar no ar publicou nas últimas 8 semanas. */
const SCOPE_DAYS = 56
/** Entram sempre, mesmo sem histórico de bar (futebol). */
const DEFAULT_CHAMPIONSHIPS = [
  'Brasileirão Série A',
  'Copa do Brasil',
  'Libertadores'
]

type Scope = { sportId: string; championship: string }

export async function readScope(
  now: Date
): Promise<{ scope: Scope[]; futebolId: string | null }> {
  const { rows } = await db.execute<Scope & { bars: number }>(sql`
    SELECT e.sport_id AS "sportId",
      mode() WITHIN GROUP (ORDER BY e.championship) AS championship,
      count(DISTINCT e.bar_id)::int AS bars
    FROM event e
    JOIN bar b ON b.id = e.bar_id
    WHERE b.is_active
      AND e.published_at IS NOT NULL
      AND e.starts_at >= ${utcNowSql(now)} - make_interval(days => ${SCOPE_DAYS})
    GROUP BY e.sport_id, search_normalize(e.championship)
    ORDER BY bars DESC, championship
    LIMIT ${MAX_CHAMPIONSHIPS}
  `)
  const { rows: futebol } = await db.execute<{ id: string }>(
    sql`SELECT id FROM sport WHERE slug = 'futebol'`
  )
  const defaults = futebol[0]
    ? DEFAULT_CHAMPIONSHIPS.map((championship) => ({
        sportId: futebol[0]?.id as string,
        championship
      }))
    : []
  const seen = new Set<string>()
  const scope = [...rows, ...defaults]
    .filter(({ sportId, championship }) => {
      const k = `${sportId}|${fold(championship)}`
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
    .slice(0, MAX_CHAMPIONSHIPS)
    .map(({ sportId, championship }) => ({ sportId, championship }))
  return { scope, futebolId: futebol[0]?.id ?? null }
}

/** Gasto do mês de Brasília desta rotina, em US$. */
export async function weeklyGamesMonthUsd(now: Date) {
  const w = brasiliaWindows(now)
  const { rows } = await db.execute<{ usd: string | number }>(sql`
    SELECT coalesce(sum(cost_usd), 0) AS usd FROM ai_run
    WHERE feature = 'weekly_games'
      AND created_at >= ${w.monthStart} AND created_at < ${w.nextMonth}
  `)
  return Number(rows[0]?.usd ?? 0)
}

/**
 * O time do catálogo (`team`) de cada nome, pelo nome ou por um apelido
 * exato, sem acento; no empate, o mais relevante. Nome sem par fica de fora.
 */
async function matchTeams(sportId: string, names: string[]) {
  const folded = [...new Set(names.map((n) => fold(n)))]
  if (!folded.length) return new Map<string, { id: string; name: string }>()
  const { rows } = await db.execute<{ q: string; id: string; name: string }>(sql`
    SELECT q.q, t.id, t.name
    FROM unnest(ARRAY[${sql.join(
      folded.map((n) => sql`${n}`),
      sql`, `
    )}]::text[]) AS q(q)
    JOIN LATERAL (
      SELECT t.id, t.name FROM team t
      WHERE t.sport_id = ${sportId}
        AND (' | ' || t.search_text || ' | ') LIKE '% | ' || q.q || ' | %'
      ORDER BY (search_normalize(t.name) = q.q) DESC, t.relevance DESC
      LIMIT 1
    ) t ON true
  `)
  return new Map(rows.map((r) => [r.q, { id: r.id, name: r.name }]))
}

/** Grava os jogos da semana. Mesmo jogo regravado mantém o id e, sem canal novo, o canal que tinha. */
async function saveCatalog(weekStart: string, games: MergedGame[]) {
  let saved = 0
  for (const sportId of new Set(games.map((g) => g.sportId))) {
    const ofSport = games.filter((g) => g.sportId === sportId)
    const teams = await matchTeams(
      sportId,
      ofSport.flatMap((g) => g.sides ?? [])
    )
    const values = ofSport.map((game) => {
      const home = game.sides ? teams.get(fold(game.sides[0])) : undefined
      const away = game.sides ? teams.get(fold(game.sides[1])) : undefined
      // A regra de `gameTitle`: "A × B" com os nomes do catálogo quando os
      // dois casaram, que é o que um bar que publicou o jogo mostra.
      const title = game.sides
        ? `${home && away ? home.name : game.sides[0]} × ${home && away ? away.name : game.sides[1]}`
        : game.name
      return {
        weekStart,
        key: game.key,
        sportId,
        championship: game.championship,
        title,
        homeTeamId: home && away ? home.id : null,
        awayTeamId: home && away ? away.id : null,
        startsAt: game.startsAt,
        channels: game.channels,
        channelConfirmed: game.channelConfirmed,
        sources: game.sources
      }
    })
    if (!values.length) continue
    await db
      .insert(weeklyGame)
      .values(values)
      .onConflictDoUpdate({
        target: [weeklyGame.weekStart, weeklyGame.key],
        set: {
          championship: sql`excluded.championship`,
          title: sql`excluded.title`,
          homeTeamId: sql`excluded.home_team_id`,
          awayTeamId: sql`excluded.away_team_id`,
          startsAt: sql`excluded.starts_at`,
          channels: sql`CASE WHEN cardinality(excluded.channels) > 0 THEN excluded.channels ELSE ${weeklyGame.channels} END`,
          channelConfirmed: sql`CASE WHEN cardinality(excluded.channels) > 0 THEN excluded.channel_confirmed ELSE ${weeklyGame.channelConfirmed} END`,
          sources: sql`excluded.sources`,
          updatedAt: sql`now()`
        }
      })
    saved += values.length
  }
  return saved
}

export type WeeklyGamesResult =
  | { skipped: string }
  | {
      mode: 'catalog' | 'channels'
      weekStart: string
      championships: number
      games: number
      withChannel: number
      confirmed: number
      searches: number
      pages: number
      skippedPages: number
      extractions: number
      costUsd: number
      monthUsd: number
      budgetUsd: number
      stoppedByBudget: boolean
      errors: string[]
    }

/**
 * O que a rotina faz hoje. Cron: segunda monta, quinta procura canal, os
 * outros dias nada (e nada com a chave desligada). Houdini ("Rodar agora"):
 * monta se a semana ainda não tem catálogo, senão procura canal, ligada ou não.
 */
export async function runWeeklyGames(
  trigger: 'cron' | 'houdini',
  now = new Date()
): Promise<WeeklyGamesResult> {
  const config = await getAppConfig('weekly_games.config')
  const week = brasiliaWeekOf(now)
  let mode: 'catalog' | 'channels' | null = null
  if (trigger === 'cron') {
    if (!config.enabled) return { skipped: 'desligada' }
    mode = week.weekday === 1 ? 'catalog' : week.weekday === 4 ? 'channels' : null
  } else {
    const [row] = await db
      .select({ id: weeklyGame.id })
      .from(weeklyGame)
      .where(eq(weeklyGame.weekStart, week.monday))
      .limit(1)
    mode = row ? 'channels' : 'catalog'
  }
  if (!mode) return { skipped: 'fora do dia' }

  const binding = await getAiBinding().catch(() => null)
  const gatewayId = aiGatewayId()
  const token = await cloudflareApiToken().catch(() => null)
  if (!binding || !gatewayId || !token || !env.CF_ACCOUNT_ID)
    throw new Error(
      'Sem binding de IA, Gateway, CF_API_TOKEN ou CF_ACCOUNT_ID: a rotina não busca.'
    )
  const cf: Cloudflare = { accountId: env.CF_ACCOUNT_ID, token, gatewayId }
  const budget = createBudget(
    config.monthlyBudgetUsd,
    await weeklyGamesMonthUsd(now)
  )

  const stats = {
    searches: 0,
    pages: 0,
    skippedPages: 0,
    extractions: 0,
    errors: [] as string[]
  }
  const note = (error: unknown) => {
    if (error instanceof BudgetStop) throw error
    if (stats.errors.length < 5)
      stats.errors.push((error as Error).message.slice(0, 200))
  }

  const outcome = await runAi(
    {
      userId: null,
      feature: 'weekly_games',
      variant: mode,
      assignedModel: EXTRACTION_MODEL
    },
    { binding, gatewayId },
    async (call, _runId, charge) => {
      const search = async (query: string) => {
        budget.guard(SEARCH_USD)
        const hits = await webSearch(cf, query)
        stats.searches++
        budget.add(SEARCH_USD)
        charge(SEARCH_USD)
        return hits
      }
      const read = async (url: string) => {
        budget.guard(BROWSER_WORST_USD)
        const page = await readPage(cf, url)
        if (!page.ok) {
          stats.skippedPages++
          return null
        }
        stats.pages++
        const usd = page.browserMs * BROWSER_USD_PER_MS
        budget.add(usd)
        charge(usd)
        return page.markdown
      }
      const extract = async (
        page: string,
        url: string,
        championship: string,
        days: readonly string[]
      ) => {
        const { input, estimatedTokensIn } = extractionInput(
          page,
          url,
          championship,
          days,
          week.today
        )
        budget.guard(
          costUsd(EXTRACTION_MODEL, {
            tokensIn: estimatedTokensIn,
            tokensOut: MAX_OUT_TOKENS
          })
        )
        const raw = await call(EXTRACTION_MODEL, input, { timeoutMs: 90_000 })
        stats.extractions++
        budget.add(costUsd(EXTRACTION_MODEL, readUsage(raw as never)))
        return parseExtraction(raw, page, days)
      }
      /** Lê os primeiros resultados legíveis e devolve os jogos achados. */
      const searchAndExtract = async (
        query: string,
        scope: Scope,
        days: readonly string[],
        pages: number
      ) => {
        const out: FoundGame[] = []
        let used = 0
        for (const hit of await search(query)) {
          if (used >= pages) break
          const page = await read(hit.url)
          if (!page) continue
          used++
          try {
            for (const g of await extract(page, hit.url, scope.championship, days)) {
              const startsAt = brasiliaStart(g.day, g.time)
              if (!startsAt) continue
              out.push({
                ...scope,
                name: g.name,
                day: g.day,
                startsAt,
                channels: g.channels,
                source: { kind: 'search', url: hit.url, channels: [] }
              })
            }
          } catch (error) {
            note(error)
          }
        }
        return out
      }
      /** "Onde assistir" de um jogo só; devolve as fontes que trouxeram canal. */
      const followUp = async (game: {
        sportId: string
        championship: string
        name: string
        key: string
        startsAt: Date
      }) => {
        const day = brasiliaDay(game.startsAt)
        const found = await searchAndExtract(
          `${game.name} ${dayMonth(day)} onde assistir ao vivo`,
          game,
          [day],
          1
        )
        return found.filter(
          (g) => g.channels.length && gameKey(g.day, g.name) === game.key
        )
      }

      let stopped = false
      let games: MergedGame[] = []
      let championships = 0
      try {
        if (mode === 'catalog') {
          const { scope, futebolId: futebol } = await readScope(now)
          championships = scope.length
          const found: FoundGame[] = []
          if (env.FOOTBALL_DATA_API_KEY && futebol) {
            const codes = footballDataCodes(
              scope.filter((s) => s.sportId === futebol).map((s) => s.championship)
            )
            try {
              const fixtures = await footballDataFixtures(
                env.FOOTBALL_DATA_API_KEY,
                week.days[0] as string,
                week.days[6] as string,
                [...codes.keys()]
              )
              for (const f of fixtures)
                found.push({
                  sportId: futebol,
                  championship: codes.get(f.code) ?? f.code,
                  name: `${f.home} x ${f.away}`,
                  day: brasiliaDay(f.startsAt),
                  startsAt: f.startsAt,
                  channels: [],
                  source: { kind: 'football-data', url: null, channels: [] }
                })
            } catch (error) {
              note(error)
            }
          }
          const range = `${dayMonth(week.days[0] as string)} a ${dayMonth(week.days[6] as string)}`
          for (const s of scope)
            found.push(
              ...(await searchAndExtract(
                `${s.championship} jogos desta semana onde assistir ${range} ${week.monday.slice(0, 4)}`,
                s,
                week.days,
                PAGES_PER_CHAMPIONSHIP
              ))
            )
          games = mergeGames(found)
          const missing = games
            .filter((g) => !g.channels.length && g.startsAt > now)
            .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
            .slice(0, MAX_FOLLOWUPS)
          for (const game of missing) found.push(...(await followUp(game)))
          games = mergeGames(found)
        } else {
          const rows = await db
            .select()
            .from(weeklyGame)
            .where(
              and(
                eq(weeklyGame.weekStart, week.monday),
                sql`cardinality(${weeklyGame.channels}) = 0`,
                sql`${weeklyGame.startsAt} > ${utcNowSql(now)}`
              )
            )
            .orderBy(weeklyGame.startsAt)
            .limit(MAX_FOLLOWUPS)
          for (const row of rows) {
            const extra = await followUp({ ...row, name: row.title })
            if (!extra.length) continue
            const [game] = markConfirmation([
              {
                ...row,
                name: row.title,
                day: brasiliaDay(row.startsAt),
                sides: splitSides(row.title),
                channels: mergeGames(extra)[0]?.channels ?? [],
                sources: [
                  ...(row.sources as WeeklyGameSource[]),
                  ...mergeGames(extra).flatMap((g) => g.sources)
                ]
              }
            ])
            if (game) games.push(game)
          }
        }
      } catch (error) {
        if (!(error instanceof BudgetStop)) throw error
        stopped = true
        note(new Error(error.message))
      }
      // O que achou até o teto também vale.
      const saved =
        mode === 'catalog'
          ? await saveCatalog(week.monday, games)
          : await saveChannels(games)
      return {
        value: {
          championships,
          games: saved,
          withChannel: games.filter((g) => g.channels.length).length,
          confirmed: games.filter((g) => g.channelConfirmed).length
        },
        status: stopped ? 'stopped' : 'ok',
        servedModel: stats.extractions ? EXTRACTION_MODEL : null,
        useful: false
      }
    }
  )

  return {
    mode,
    weekStart: week.monday,
    ...outcome.value,
    searches: stats.searches,
    pages: stats.pages,
    skippedPages: stats.skippedPages,
    extractions: stats.extractions,
    costUsd: Number(budget.runUsd.toFixed(4)),
    monthUsd: Number(budget.monthUsd.toFixed(4)),
    budgetUsd: config.monthlyBudgetUsd,
    stoppedByBudget: outcome.status === 'stopped',
    errors: stats.errors
  }
}

/** Quinta: só canal, confirmação e fontes dos jogos que acharam canal. */
async function saveChannels(games: (MergedGame & { id?: string })[]) {
  for (const game of games)
    if (game.id)
      await db
        .update(weeklyGame)
        .set({
          channels: game.channels,
          channelConfirmed: game.channelConfirmed,
          sources: game.sources,
          updatedAt: new Date()
        })
        .where(eq(weeklyGame.id, game.id))
  return games.length
}
