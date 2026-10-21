import { sql } from 'drizzle-orm'
import {
  check,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex
} from 'drizzle-orm/pg-core'
import { user } from './auth'

/**
 * Amizade entre torcedores (S1 do design do app). Uma linha por dupla, em
 * qualquer direção: `requester` pediu, `addressee` recebeu. Pendente até quem
 * recebeu aceitar; recusar ou desfazer apaga a linha, sem registro.
 *
 * Quem entra pelo link de convite já nasce aceito (`accepted_at` no pedido):
 * mandar o link é o consentimento de quem convidou.
 */
export const friendship = pgTable(
  'friendship',
  {
    requesterId: text('requester_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    addresseeId: text('addressee_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    // Como o pedido chegou: busca, código ou QR, link de convite, contatos,
    // sugestão. Só informa a tela ("Pelo seu link").
    via: text('via', {
      enum: ['search', 'code', 'link', 'contacts', 'suggestion']
    }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    // `null`: pedido pendente.
    acceptedAt: timestamp('accepted_at', { withTimezone: true })
  },
  (table) => [
    primaryKey({ columns: [table.requesterId, table.addresseeId] }),
    // A mesma dupla não tem dois pedidos, um em cada direção.
    uniqueIndex('friendship_pair_idx').on(
      sql`LEAST(${table.requesterId}, ${table.addresseeId})`,
      sql`GREATEST(${table.requesterId}, ${table.addresseeId})`
    ),
    // Pedidos recebidos e o cascade de `user`.
    index('friendship_addressee_idx').on(table.addresseeId),
    check(
      'friendship_not_self',
      sql`${table.requesterId} <> ${table.addresseeId}`
    )
  ]
)
