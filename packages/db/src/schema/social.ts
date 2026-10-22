import { sql } from 'drizzle-orm'
import {
  check,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex
} from 'drizzle-orm/pg-core'
import { user } from './auth'
import { bar, event } from './platform'

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

/**
 * "Chamar Marina" (Rodada 24): o convite de um amigo para um jogo num bar.
 * Sem mensagem livre: quem recebe vê o card em Avisos e responde "Vou também"
 * (marca presença) ou "Agora não" (quem chamou não fica sabendo). Um chamado
 * por amigo e jogo; chamar de novo não duplica.
 */
export const friendCall = pgTable(
  'friend_call',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    fromUserId: text('from_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    toUserId: text('to_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    eventId: text('event_id')
      .notNull()
      .references(() => event.id, { onDelete: 'cascade' }),
    barId: text('bar_id')
      .notNull()
      .references(() => bar.id, { onDelete: 'cascade' }),
    status: text('status', { enum: ['pending', 'going', 'not_now'] })
      .default('pending')
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    respondedAt: timestamp('responded_at', { withTimezone: true })
  },
  (table) => [
    // Também serve à busca por quem chamou ("Marina vai também").
    unique('friend_call_from_to_event_key').on(
      table.fromUserId,
      table.toUserId,
      table.eventId
    ),
    // Os chamados recebidos (Avisos) e o cascade de `user`.
    index('friend_call_to_idx').on(table.toUserId),
    index('friend_call_event_idx').on(table.eventId),
    check('friend_call_not_self', sql`${table.fromUserId} <> ${table.toUserId}`)
  ]
)
