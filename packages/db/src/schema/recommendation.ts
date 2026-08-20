import { relations } from 'drizzle-orm'
import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique
} from 'drizzle-orm/pg-core'
import { user } from './auth'
import { bar } from './platform'

export const recommendationEventTypeEnum = pgEnum('recommendation_event_type', [
  'impression',
  'open',
  'dismiss',
  'unfavorite',
  'favorite',
  'directions_opened',
  'phone_clicked',
  'whatsapp_opened',
  'reset'
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
