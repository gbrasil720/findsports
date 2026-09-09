import { relations } from 'drizzle-orm'
import {
  boolean,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique
} from 'drizzle-orm/pg-core'
import { user } from './auth'
import { bar, event } from './platform'

/* ------------------------------------------------------------------ */
/*  Enum de ação comercial (seção 9.2)                                 */
/* ------------------------------------------------------------------ */

export const barCommercialEventTypeEnum = pgEnum('bar_commercial_event_type', [
  'profile_view',
  'directions_opened',
  'phone_clicked',
  'whatsapp_opened'
])

/* ------------------------------------------------------------------ */
/*  bar_commercial_event — eventos brutos (seção 9.3)                  */
/* ------------------------------------------------------------------ */

export const barCommercialEvent = pgTable(
  'bar_commercial_event',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    barId: text('bar_id')
      .notNull()
      .references(() => bar.id, { onDelete: 'cascade' }),
    actorUserId: text('actor_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    type: barCommercialEventTypeEnum('type').notNull(),
    // Chave histórica, não FK: excluir o cadastro preserva atribuição e
    // snapshots sem colidir com a deduplicação de ações sem jogo.
    sourceEventId: text('source_event_id'),
    sourceEventChampionship: text('source_event_championship'),
    sourceEventStartsAt: timestamp('source_event_starts_at'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    commercialDay: date('commercial_day').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull()
  },
  (table) => [
    // Deduplicação diária: um evento por usuário+bar+tipo+jogo+dia
    // NULLS NOT DISTINCT para sourceEventId para que "sem jogo" também
    // participe da unicidade (seção 9.3)
    unique('bar_commercial_event_dedup_key')
      .on(
        table.barId,
        table.actorUserId,
        table.type,
        table.commercialDay,
        table.sourceEventId
      )
      .nullsNotDistinct(),
    index('bar_commercial_event_barId_occurredAt_idx').on(
      table.barId,
      table.occurredAt
    ),
    index('bar_commercial_event_barId_sourceEventId_occurredAt_idx').on(
      table.barId,
      table.sourceEventId,
      table.occurredAt
    ),
    index('bar_commercial_event_actorUserId_occurredAt_idx').on(
      table.actorUserId,
      table.occurredAt
    ),
    // O painel filtra sempre por bar + tipo dentro de uma faixa de datas.
    index('bar_commercial_event_barId_type_occurredAt_idx').on(
      table.barId,
      table.type,
      table.occurredAt
    ),
    // Também atende consultas e retenção por atribuição histórica.
    index('bar_commercial_event_sourceEventId_idx').on(table.sourceEventId)
  ]
)

/* ------------------------------------------------------------------ */
/*  bar_commercial_daily_rollup — agregado diário (seção 9.4)         */
/* ------------------------------------------------------------------ */

export const barCommercialDailyRollup = pgTable(
  'bar_commercial_daily_rollup',
  {
    barId: text('bar_id')
      .notNull()
      .references(() => bar.id, { onDelete: 'cascade' }),
    commercialDay: date('commercial_day').notNull(),
    uniqueVisitors: integer('unique_visitors').default(0).notNull(),
    interestedPeople: integer('interested_people').default(0).notNull(),
    highIntentActions: integer('high_intent_actions').default(0).notNull(),
    profileViews: integer('profile_views').default(0).notNull(),
    directionsOpened: integer('directions_opened').default(0).notNull(),
    phoneClicked: integer('phone_clicked').default(0).notNull(),
    whatsappOpened: integer('whatsapp_opened').default(0).notNull(),
    isFinalized: boolean('is_finalized').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
  },
  (table) => [
    unique('bar_commercial_daily_rollup_pkey').on(
      table.barId,
      table.commercialDay
    ),
    index('bar_commercial_daily_rollup_barId_commercialDay_idx').on(
      table.barId,
      table.commercialDay
    )
  ]
)

/* ------------------------------------------------------------------ */
/*  bar_commercial_event_daily_rollup — atribuição por jogo            */
/* ------------------------------------------------------------------ */

/**
 * Projeção somável da atribuição por jogo. `eventId` é deliberadamente um
 * snapshot sem FK: o evento bruto e o cadastro do jogo podem ser removidos
 * sem apagar a leitura histórica já consolidada.
 */
export const barCommercialEventDailyRollup = pgTable(
  'bar_commercial_event_daily_rollup',
  {
    barId: text('bar_id')
      .notNull()
      .references(() => bar.id, { onDelete: 'cascade' }),
    eventId: text('event_id').notNull(),
    commercialDay: date('commercial_day').notNull(),
    profileViews: integer('profile_views').default(0).notNull(),
    directionsOpened: integer('directions_opened').default(0).notNull(),
    phoneClicked: integer('phone_clicked').default(0).notNull(),
    whatsappOpened: integer('whatsapp_opened').default(0).notNull(),
    isFinalized: boolean('is_finalized').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
  },
  (table) => [
    unique('bar_commercial_event_daily_rollup_pkey').on(
      table.barId,
      table.eventId,
      table.commercialDay
    ),
    index('bar_commercial_event_daily_rollup_barId_commercialDay_idx').on(
      table.barId,
      table.commercialDay
    )
  ]
)

/* ------------------------------------------------------------------ */
/*  bar_commercial_monthly_rollup — agregado mensal (seção 9.4)       */
/* ------------------------------------------------------------------ */

export const barCommercialMonthlyRollup = pgTable(
  'bar_commercial_monthly_rollup',
  {
    barId: text('bar_id')
      .notNull()
      .references(() => bar.id, { onDelete: 'cascade' }),
    periodMonth: date('period_month').notNull(),
    uniqueVisitors: integer('unique_visitors').default(0).notNull(),
    interestedPeople: integer('interested_people').default(0).notNull(),
    highIntentActions: integer('high_intent_actions').default(0).notNull(),
    profileViews: integer('profile_views').default(0).notNull(),
    directionsOpened: integer('directions_opened').default(0).notNull(),
    phoneClicked: integer('phone_clicked').default(0).notNull(),
    whatsappOpened: integer('whatsapp_opened').default(0).notNull(),
    isFinalized: boolean('is_finalized').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
  },
  (table) => [
    unique('bar_commercial_monthly_rollup_pkey').on(
      table.barId,
      table.periodMonth
    ),
    index('bar_commercial_monthly_rollup_barId_periodMonth_idx').on(
      table.barId,
      table.periodMonth
    )
  ]
)

/* ------------------------------------------------------------------ */
/*  rollup_checkpoint — checkpoint de consolidação (seção 9.4)        */
/* ------------------------------------------------------------------ */

export const rollupCheckpoint = pgTable(
  'rollup_checkpoint',
  {
    barId: text('bar_id')
      .notNull()
      .references(() => bar.id, { onDelete: 'cascade' }),
    lastProcessedAt: timestamp('last_processed_at', {
      withTimezone: true
    }).notNull(),
    rollupPeriodStart: timestamp('rollup_period_start', {
      withTimezone: true
    }).notNull(),
    rollupPeriodEnd: timestamp('rollup_period_end', {
      withTimezone: true
    }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
  },
  (table) => [unique('rollup_checkpoint_barId_key').on(table.barId)]
)

/* ------------------------------------------------------------------ */
/*  Relations                                                          */
/* ------------------------------------------------------------------ */

export const barCommercialEventRelations = relations(
  barCommercialEvent,
  ({ one }) => ({
    bar: one(bar, {
      fields: [barCommercialEvent.barId],
      references: [bar.id]
    }),
    actor: one(user, {
      fields: [barCommercialEvent.actorUserId],
      references: [user.id]
    }),
    sourceEvent: one(event, {
      fields: [barCommercialEvent.sourceEventId],
      references: [event.id]
    })
  })
)

export const barCommercialDailyRollupRelations = relations(
  barCommercialDailyRollup,
  ({ one }) => ({
    bar: one(bar, {
      fields: [barCommercialDailyRollup.barId],
      references: [bar.id]
    })
  })
)

export const barCommercialEventDailyRollupRelations = relations(
  barCommercialEventDailyRollup,
  ({ one }) => ({
    bar: one(bar, {
      fields: [barCommercialEventDailyRollup.barId],
      references: [bar.id]
    })
  })
)

export const barCommercialMonthlyRollupRelations = relations(
  barCommercialMonthlyRollup,
  ({ one }) => ({
    bar: one(bar, {
      fields: [barCommercialMonthlyRollup.barId],
      references: [bar.id]
    })
  })
)

export const rollupCheckpointRelations = relations(
  rollupCheckpoint,
  ({ one }) => ({
    bar: one(bar, {
      fields: [rollupCheckpoint.barId],
      references: [bar.id]
    })
  })
)
