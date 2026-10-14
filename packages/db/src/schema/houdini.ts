import { index, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

/**
 * Grimório do Houdini (WEB-384): toda ação de admin fica escrita aqui.
 *
 * Só se escreve. Uma trigger (migration 0058) recusa UPDATE e DELETE: nem o
 * próprio app consegue reescrever o que aconteceu.
 *
 * Sem chave estrangeira de propósito: apagar a conta de quem agiu, ou do
 * alvo, não pode apagar nem travar o registro. Por isso nome e e-mail vão
 * copiados na linha, no momento da ação.
 */
export const adminAction = pgTable(
  'admin_action',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    actorId: text('actor_id').notNull(),
    actorName: text('actor_name').notNull(),
    /** O truque: `user.impersonate`, `user.ban`, `config.set`, … */
    kind: text('kind').notNull(),
    /** `user`, `bar`, `event`, `config`. */
    targetType: text('target_type').notNull(),
    targetId: text('target_id').notNull(),
    /** Como o alvo se chamava na hora: e-mail, nome do bar, chave. */
    targetLabel: text('target_label').notNull(),
    before: jsonb('before'),
    after: jsonb('after'),
    /** O resto que explica a ação: motivo do banimento, duração. */
    detail: jsonb('detail')
  },
  (table) => [
    index('admin_action_created_at_idx').on(table.createdAt),
    index('admin_action_target_idx').on(table.targetType, table.targetId)
  ]
)
