import { relations } from 'drizzle-orm'
import { index, pgEnum, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { bar } from './platform'

export const supportRequestCategoryEnum = pgEnum('support_request_category', [
  'account',
  'billing',
  'profile',
  'events',
  'other'
])

export const supportRequestStatusEnum = pgEnum('support_request_status', [
  'open',
  'in_progress',
  'resolved'
])

export const supportRequest = pgTable(
  'support_request',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    barId: text('bar_id')
      .notNull()
      .references(() => bar.id, { onDelete: 'cascade' }),
    subject: text('subject').notNull(),
    category: supportRequestCategoryEnum('category').notNull(),
    description: text('description').notNull(),
    status: supportRequestStatusEnum('status').default('open').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull()
  },
  (table) => [
    index('support_request_barId_createdAt_idx').on(
      table.barId,
      table.createdAt
    ),
    index('support_request_status_createdAt_idx').on(
      table.status,
      table.createdAt
    )
  ]
)

export const supportRequestRelations = relations(supportRequest, ({ one }) => ({
  bar: one(bar, {
    fields: [supportRequest.barId],
    references: [bar.id]
  })
}))
