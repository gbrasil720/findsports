import {
  boolean,
  date,
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique
} from 'drizzle-orm/pg-core'
import { bar, sport, team } from './platform'

/** De onde saiu um jogo do catálogo: a página lida ou o calendário. */
export type WeeklyGameSource = {
  /** `football-data` (calendário) ou `search` (busca + leitura + IA). */
  kind: 'football-data' | 'search'
  url: string | null
  /** Canais que essa fonte deu para o jogo, como ela escreveu. */
  channels: string[]
}

/**
 * Jogos da semana com onde passa (WEB-433): um catálogo só, montado às
 * segundas pela rotina `weekly_games` (`packages/api/src/lib/weekly-games/`),
 * e lido pelas sugestões de jogo de cada bar. Uma linha por jogo e semana
 * (`key`: dia de Brasília + começo do nome dos times sem acento), regravada
 * pela rotina sem trocar o id, para o "Não passo esse" do bar continuar valendo.
 *
 * `starts_at` é `timestamp` sem fuso guardando UTC, como `event.starts_at`.
 * `home_team_id` e `away_team_id` só quando o nome casou com o catálogo de
 * times (`team`); o título segue a regra de `gameTitle`.
 */
export const weeklyGame = pgTable(
  'weekly_game',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    // A segunda-feira da semana, no calendário de Brasília.
    weekStart: date('week_start').notNull(),
    key: text('key').notNull(),
    sportId: text('sport_id')
      .notNull()
      .references(() => sport.id, { onDelete: 'cascade' }),
    championship: text('championship').notNull(),
    title: text('title').notNull(),
    homeTeamId: text('home_team_id').references(() => team.id, {
      onDelete: 'set null'
    }),
    awayTeamId: text('away_team_id').references(() => team.id, {
      onDelete: 'set null'
    }),
    startsAt: timestamp('starts_at').notNull(),
    // Onde passa no Brasil, nomes curtos ("Premiere", "SporTV"). Vazio é
    // "ainda não sabemos": a quinta procura de novo.
    channels: text('channels').array().notNull().default([]),
    // Falso quando a lista é a da competição inteira (mesmos canais em todos
    // os jogos da rodada), não a da transmissão escolhida.
    channelConfirmed: boolean('channel_confirmed').notNull().default(false),
    sources: jsonb('sources').$type<WeeklyGameSource[]>().notNull().default([]),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
  },
  (table) => [
    unique('weekly_game_week_key').on(table.weekStart, table.key),
    index('weekly_game_starts_at_idx').on(table.startsAt)
  ]
)

/** "Não passo esse": o jogo do catálogo que o bar dispensou não volta. */
export const barGameDismissal = pgTable(
  'bar_game_dismissal',
  {
    barId: text('bar_id')
      .notNull()
      .references(() => bar.id, { onDelete: 'cascade' }),
    weeklyGameId: text('weekly_game_id')
      .notNull()
      .references(() => weeklyGame.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull()
  },
  (table) => [
    primaryKey({ columns: [table.barId, table.weeklyGameId] }),
    index('bar_game_dismissal_game_idx').on(table.weeklyGameId)
  ]
)
