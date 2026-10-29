import { relations, sql } from 'drizzle-orm'
import {
  boolean,
  check,
  index,
  pgTable,
  smallint,
  text,
  timestamp,
  unique
} from 'drizzle-orm/pg-core'
import { REVIEW_REASON_MAX } from '../bar-gallery'
import { RATING_COMMENT_MAX, RATING_STARS_MAX } from '../rating-limits'
import { user } from './auth'
import { bar, event } from './platform'
import { reviewStatusEnum } from './review-status'

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
 * Quem pode escrever aqui é decidido no servidor, em `postGame.answer`: só
 * quem já demonstrou intenção de ir àquele bar naquele jogo — sinal que
 * `bar_commercial_event` já registra — e só depois do jogo acabar.
 *
 * Só a avaliação VERIFICADA entra na nota pública (WEB-408): a de quem teve o
 * código validado no balcão ou fez check-in no bar durante o jogo. A outra é
 * gravada e aparece para o dono e na revisão, mas não mexe nos contadores.
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
    // "O que pesou?" (WEB-398): etiquetas opcionais, sem texto livre. Ids do
    // vocabulário de `packages/api/src/lib/rating-reasons.ts`; a página do
    // bar só mostra o resumo, sem nome de ninguém.
    reasons: text('reasons').array().default(sql`'{}'`).notNull(),
    // Nota em estrelas (WEB-451). Nula nas avaliações de antes dela e nas
    // que chegam pelo adaptador antigo (`ratings.submit`).
    stars: smallint('stars'),
    // Comentário escrito (WEB-451): só aparece, para o bar e para o
    // torcedor, depois da revisão da Onside (`/houdini/revisao`). Recusado,
    // o motivo fica para o Grimório e o texto não sai daqui.
    comment: text('comment'),
    commentReview: reviewStatusEnum('comment_review'),
    commentRejectionReason: text('comment_rejection_reason'),
    // A pessoa escolhe se o nome dela aparece com a avaliação. Sem escolher,
    // fica anônima: é o que já valia antes do WEB-451.
    identified: boolean('identified').default(false).notNull(),
    // Código validado no balcão ou check-in naquele jogo (WEB-408). Quem
    // escreve é o banco: um trigger antes da gravação o calcula, e os
    // triggers de `reservation_code_use` e `attendance_checkin` o refazem
    // quando a prova chega (ou o código é desfeito) depois da avaliação. O
    // TypeScript nunca grava este campo.
    verified: boolean('verified').default(false).notNull(),
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
    index('bar_rating_actor_idx').on(table.actorUserId, table.eventId),
    // A fila de comentários do Houdini.
    index('bar_rating_comment_pending_idx')
      .on(table.updatedAt)
      .where(sql`comment_review = 'pending'`),
    check(
      'bar_rating_stars_range',
      sql`${table.stars} IS NULL OR ${table.stars} BETWEEN 1 AND ${sql.raw(String(RATING_STARS_MAX))}` // sql-raw-permitido: constante de limite em CHECK
    ),
    // Comentário e revisão andam juntos; o motivo só existe na recusa.
    check(
      'bar_rating_comment_review',
      sql`(${table.comment} IS NULL) = (${table.commentReview} IS NULL) AND (${table.comment} IS NULL OR char_length(${table.comment}) BETWEEN 1 AND ${sql.raw(String(RATING_COMMENT_MAX))}) AND (${table.commentReview} IS NOT DISTINCT FROM 'rejected') = (${table.commentRejectionReason} IS NOT NULL) AND (${table.commentRejectionReason} IS NULL OR char_length(${table.commentRejectionReason}) BETWEEN 1 AND ${sql.raw(String(REVIEW_REASON_MAX))})` // sql-raw-permitido: constante de limite em CHECK
    )
  ]
)

export const barRatingRelations = relations(barRating, ({ one }) => ({
  bar: one(bar, { fields: [barRating.barId], references: [bar.id] }),
  actor: one(user, { fields: [barRating.actorUserId], references: [user.id] }),
  event: one(event, { fields: [barRating.eventId], references: [event.id] })
}))
