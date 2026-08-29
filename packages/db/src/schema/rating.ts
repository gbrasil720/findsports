import { relations } from 'drizzle-orm'
import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  unique
} from 'drizzle-orm/pg-core'
import { user } from './auth'
import { bar, event } from './platform'

/**
 * "Voltaria para ver jogo aqui?" — a avaliação da Onside.
 *
 * Binária e presa a UM jogo. Não é nota do bar em geral: essa o Google Maps
 * já dá, com dez anos de vantagem. É nota da experiência de assistir, que é a
 * única que esta plataforma pode ter.
 *
 * A unicidade é por `(bar, torcedor, jogo)` e não por `(bar, torcedor)`: quem
 * volta ao mesmo bar em outro jogo avalia de novo. É isso que faz a nota
 * acompanhar o presente em vez de fossilizar numa média antiga.
 *
 * Quem pode escrever aqui é decidido no servidor, em `ratings.submit`: só
 * quem já demonstrou intenção de ir àquele bar naquele jogo — sinal que
 * `bar_commercial_event` já registra — e só depois do jogo acabar.
 */
export const barRating = pgTable(
  'bar_rating',
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
    eventId: text('event_id')
      .notNull()
      .references(() => event.id, { onDelete: 'cascade' }),
    wouldReturn: boolean('would_return').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull()
  },
  (table) => [
    unique('bar_rating_actor_event_key').on(
      table.barId,
      table.actorUserId,
      table.eventId
    ),
    // O painel do dono lista da mais recente para a mais antiga.
    index('bar_rating_barId_createdAt_idx').on(table.barId, table.createdAt),
    // "O que eu ainda não avaliei" parte do torcedor, não do bar.
    index('bar_rating_actor_idx').on(table.actorUserId, table.eventId)
  ]
)

export const barRatingRelations = relations(barRating, ({ one }) => ({
  bar: one(bar, { fields: [barRating.barId], references: [bar.id] }),
  actor: one(user, { fields: [barRating.actorUserId], references: [user.id] }),
  event: one(event, { fields: [barRating.eventId], references: [event.id] })
}))
