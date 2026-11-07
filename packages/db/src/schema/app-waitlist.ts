import { sql } from 'drizzle-orm'
import { check, index, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { user } from './auth'

/**
 * "Me avise quando o app chegar" (dono, 05/11/2026): um e-mail por linha,
 * sempre em minúsculas. `user_id` é de quem entrou logado (o web hoje só
 * deixa assim); a landing poderá gravar só o e-mail. Sair da lista grava
 * `unsubscribed_at` em vez de apagar: é o registro de que a pessoa pediu
 * para não receber, e o envio do lançamento (`notified_at`) pula essas.
 */
export const appWaitlist = pgTable(
  'app_waitlist',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    email: text('email').notNull().unique(),
    userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
    source: text('source', { enum: ['landing', 'web'] }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    notifiedAt: timestamp('notified_at', { withTimezone: true }),
    unsubscribedAt: timestamp('unsubscribed_at', { withTimezone: true })
  },
  (table) => [
    index('app_waitlist_user_idx').on(table.userId),
    check(
      'app_waitlist_email_lower',
      sql`${table.email} = lower(${table.email})`
    ),
    check('app_waitlist_source', sql`${table.source} in ('landing', 'web')`)
  ]
)
