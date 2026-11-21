import { sql } from 'drizzle-orm'
import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { user } from './auth'

/**
 * Cada `PUT` assinado para o bucket de mídia (foto do bar e avatar). A linha
 * nasce quando a rota assina e é confirmada quando o arquivo entra no app
 * (`pub.addPhoto`, `/update-user` com `image`), depois de o servidor ler os
 * primeiros bytes. O que fica sem confirmar por mais de 24 h sai do bucket
 * pela rotina `media_cleanup` (`packages/auth/src/media-upload-record.ts`).
 */
export const mediaUpload = pgTable(
  'media_upload',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    key: text('key').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: ['bar_photo', 'avatar'] }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true })
  },
  (table) => [
    index('media_upload_user_key_idx').on(table.userId, table.key),
    index('media_upload_pending_idx')
      .on(table.createdAt)
      .where(sql`${table.confirmedAt} is null`)
  ]
)
