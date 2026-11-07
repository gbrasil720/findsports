import { db, sql } from '@findsports_oficial/db'
import { utcNowSql } from '@findsports_oficial/db/event-window-sql'
import { gameTitle } from '../game-participants'
import { utcIso } from '../utc-timestamp'
import type {
  GameSuggestion,
  GameSuggestionSource,
  SuggestionRequest
} from './index'

/*
 * "Jogos que outros bares perto já marcaram": o que os bares no ar da mesma
 * cidade publicaram para os próximos 7 dias. Rascunho não entra (o torcedor
 * não vê). Cidade comparada sem caixa nem acento (`search_normalize`).
 */

const WINDOW_DAYS = 7
/** Teto de linhas (jogo × bar) lidas antes de juntar por jogo. */
const ROW_LIMIT = 500

export type SuggestionRow = {
  bar_id: string
  sport_id: string
  championship: string
  starts_at: string
  participant_free_text: string | null
  participant_ids: string[] | null
  title: string
}

/**
 * Junta as linhas por jogo (início + título), tira os que o bar já tem e fica
 * com os `limit` que mais bares marcaram, na ordem do início.
 */
export function groupSuggestions(
  rows: SuggestionRow[],
  { barId, limit }: Pick<SuggestionRequest, 'barId' | 'limit'>
): GameSuggestion[] {
  const games = new Map<string, GameSuggestion & { bars: Set<string> }>()
  const own = new Set<string>()
  for (const row of rows) {
    const startsAt = utcIso(row.starts_at)
    const key = `${startsAt}|${row.title}`
    if (row.bar_id === barId) {
      own.add(key)
      continue
    }
    const game = games.get(key) ?? {
      key,
      title: row.title,
      sportId: row.sport_id,
      championship: row.championship,
      startsAt,
      participantIds: row.participant_ids ?? [],
      participantFreeText: row.participant_free_text || null,
      bars: new Set<string>()
    }
    game.bars.add(row.bar_id)
    games.set(key, game)
  }
  return [...games.values()]
    .filter((game) => !own.has(game.key))
    .sort(
      (a, b) => b.bars.size - a.bars.size || a.startsAt.localeCompare(b.startsAt)
    )
    .slice(0, limit)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    .map(({ bars: _bars, ...game }) => game)
}

export const nearbyBarsSource: GameSuggestionSource = {
  async suggest(request) {
    const now = utcNowSql(request.now)
    const { rows } = await db.execute<SuggestionRow>(sql`
      SELECT e.bar_id, e.sport_id, e.championship, e.starts_at,
             e.participant_free_text,
             (SELECT array_agg(ep.team_id ORDER BY ep.position, ep.team_id)
              FROM event_participants ep WHERE ep.event_id = e.id) AS participant_ids,
             ${gameTitle({
               id: sql`e.id`,
               participantFreeText: sql`e.participant_free_text`,
               championship: sql`e.championship`
             })} AS title
      FROM event e
      JOIN bar b ON b.id = e.bar_id
      WHERE e.published_at IS NOT NULL
        AND e.starts_at > ${now}
        AND e.starts_at < ${now} + make_interval(days => ${WINDOW_DAYS})
        AND (
          b.id = ${request.barId}
          OR (b.is_active AND search_normalize(b.city) = search_normalize(${request.city}))
        )
      ORDER BY e.starts_at, e.id
      LIMIT ${ROW_LIMIT}
    `)
    return groupSuggestions(rows, request)
  }
}
