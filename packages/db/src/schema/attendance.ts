import {
  index,
  pgTable,
  primaryKey,
  text,
  timestamp
} from 'drizzle-orm/pg-core'
import { user } from './auth'
import { event } from './platform'

/**
 * Presença confirmada (WEB-127, ADR 0003 "Presença"): o torcedor avisa que vai
 * assistir a um jogo em um bar. Não gera código, brinde nem ação do bar. Na
 * interface do torcedor se chama "Vou assistir aqui".
 *
 * Criar uma reserva também grava presença; cancelar a reserva não a apaga.
 * O número absoluto nunca sai para o bar, só o sinal relativo de interesse.
 */
export const attendance = pgTable(
  'attendance',
  {
    // Uma presença por torcedor por jogo, garantida pela chave.
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    eventId: text('event_id')
      .notNull()
      .references(() => event.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull()
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.eventId] }),
    // Contagem por jogo e cascade de `event`.
    index('attendance_eventId_idx').on(table.eventId)
  ]
)
