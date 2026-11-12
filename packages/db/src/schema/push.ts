import { index, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { session, user } from './auth'

/**
 * O token de push do Expo de cada aparelho (WEB-416). Preso à sessão: sair da
 * conta, revogar o aparelho em "Sessões" ou trocar a sessão (duas etapas)
 * apaga a linha em cascata, e o app registra de novo com a sessão nova. O
 * mesmo aparelho em outra conta move o token (a chave é o token).
 */
export const pushToken = pgTable(
  'push_token',
  {
    token: text('token').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    sessionId: text('session_id')
      .notNull()
      .references(() => session.id, { onDelete: 'cascade' }),
    platform: text('platform', { enum: ['ios', 'android'] }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
  },
  (table) => [index('push_token_user_idx').on(table.userId)]
)
