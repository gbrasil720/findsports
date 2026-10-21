import { relations, sql } from 'drizzle-orm'
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique
} from 'drizzle-orm/pg-core'
import { user } from './auth'
import { bar, event, sport, team } from './platform'

export const recommendationEventTypeEnum = pgEnum('recommendation_event_type', [
  'impression',
  'open',
  'dismiss',
  'unfavorite',
  'favorite',
  'directions_opened',
  'phone_clicked',
  'whatsapp_opened',
  'reset',
  // "Vou assistir" a partir do card da rodada (WEB-425).
  'attend'
])

export const recommendationEvent = pgTable(
  'recommendation_event',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    actorUserId: text('actor_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    barId: text('bar_id').references(() => bar.id, { onDelete: 'cascade' }),
    runId: text('run_id'),
    type: recommendationEventTypeEnum('type').notNull(),
    position: integer('position'),
    reason: text('reason'),
    expandedRadius: boolean('expanded_radius'),
    occurredAt: timestamp('occurred_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull()
  },
  (table) => [
    unique('recommendation_event_run_actor_bar_type_key').on(
      table.runId,
      table.actorUserId,
      table.barId,
      table.type
    ),
    index('recommendation_event_actor_occurred_idx').on(
      table.actorUserId,
      table.occurredAt
    ),
    index('recommendation_event_actor_bar_type_occurred_idx').on(
      table.actorUserId,
      table.barId,
      table.type,
      table.occurredAt
    ),
    index('recommendation_event_run_occurred_idx').on(
      table.runId,
      table.occurredAt
    )
  ]
)

export const recommendationReset = pgTable('recommendation_reset', {
  actorUserId: text('actor_user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  resetAt: timestamp('reset_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull()
})

/**
 * A rodada diária do app, "Bares pra você" (WEB-425): até cinco bares por
 * dia, gravados para a rodada ficar a mesma o dia todo e o limite valer no
 * servidor. O dia vira às 10:00 de Brasília (`day` é o dia da rodada, não o
 * do calendário). `items` guarda a conta do momento (nota, eixos e o que a
 * frase precisa); jogo e presença são lidos ao vivo.
 */
export const recommendationRound = pgTable(
  'recommendation_round',
  {
    runId: text('run_id').primaryKey(),
    actorUserId: text('actor_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    day: date('day', { mode: 'string' }).notNull(),
    radiusKm: integer('radius_km').notNull(),
    items: jsonb('items').$type<Record<string, unknown>[]>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull()
  },
  (table) => [
    unique('recommendation_round_actor_day_key').on(
      table.actorUserId,
      table.day
    )
  ]
)

/**
 * "Avisar" (23e): o torcedor pede para saber quando o bar publicar um jogo do
 * esporte ou do time. O aviso sai na tela de Avisos do app quando aparece
 * jogo que case, publicado depois do pedido; não há push (WEB-416).
 * `created_at` é `timestamp` sem fuso, como o `event.created_at` com que é
 * comparado.
 */
export const barGameAlert = pgTable(
  'bar_game_alert',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    barId: text('bar_id')
      .notNull()
      .references(() => bar.id, { onDelete: 'cascade' }),
    sportId: text('sport_id').references(() => sport.id, {
      onDelete: 'cascade'
    }),
    teamId: text('team_id').references(() => team.id, { onDelete: 'cascade' }),
    runId: text('run_id'),
    createdAt: timestamp('created_at').defaultNow().notNull()
  },
  (table) => [
    unique('bar_game_alert_user_bar_sport_team_key')
      .on(table.userId, table.barId, table.sportId, table.teamId)
      .nullsNotDistinct(),
    index('bar_game_alert_bar_idx').on(table.barId),
    check(
      'bar_game_alert_sport_or_team',
      sql`${table.sportId} IS NOT NULL OR ${table.teamId} IS NOT NULL`
    )
  ]
)

/** "Lembrar" (23c): o aviso aparece em Avisos no dia do jogo. */
export const gameReminder = pgTable(
  'game_reminder',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    eventId: text('event_id')
      .notNull()
      .references(() => event.id, { onDelete: 'cascade' }),
    runId: text('run_id'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull()
  },
  (table) => [primaryKey({ columns: [table.userId, table.eventId] })]
)

export const recommendationEventRelations = relations(
  recommendationEvent,
  ({ one }) => ({
    actor: one(user, {
      fields: [recommendationEvent.actorUserId],
      references: [user.id]
    }),
    bar: one(bar, {
      fields: [recommendationEvent.barId],
      references: [bar.id]
    })
  })
)

export const recommendationResetRelations = relations(
  recommendationReset,
  ({ one }) => ({
    actor: one(user, {
      fields: [recommendationReset.actorUserId],
      references: [user.id]
    })
  })
)
