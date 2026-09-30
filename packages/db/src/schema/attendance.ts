import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
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

/**
 * Segunda fonte de comparecimento (WEB-128, ADR 0003 "Comparecimento"): o que
 * o torcedor diz depois do jogo. A primeira fonte é o registro do bar em
 * `reservation_code_use`; as duas vivem em tabelas separadas para uma nunca
 * sobrescrever a outra.
 *
 * Nenhuma superfície do bar lê esta tabela: a resposta individual não pode
 * chegar a quem ela avalia.
 */
export const attendanceReport = pgTable(
  'attendance_report',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    eventId: text('event_id')
      .notNull()
      .references(() => event.id, { onDelete: 'cascade' }),
    attended: boolean('attended').notNull(),
    // Só é perguntado quando a reserva confirmada tinha oferta congelada.
    // Nulo em presença, em reserva sem oferta e em quem não foi.
    offerReceived: boolean('offer_received'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull()
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.eventId] }),
    // Cruzamento por jogo e cascade de `event`.
    index('attendance_report_eventId_idx').on(table.eventId),
    check(
      'attendance_report_offer_only_if_attended',
      sql`${table.attended} OR ${table.offerReceived} IS NULL`
    )
  ]
)
