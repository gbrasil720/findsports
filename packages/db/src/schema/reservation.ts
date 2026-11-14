import { relations, sql } from 'drizzle-orm'
import {
  boolean,
  check,
  index,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex
} from 'drizzle-orm/pg-core'
import { RESERVATION_CODE_PATTERN } from '../reservation-code'
import { user } from './auth'
import { event } from './platform'

export { RESERVATION_CODE_PATTERN }

/**
 * "reservation" é o código do balcão de quem vai (WEB-401): a reserva de mesa
 * saiu do produto em 16/10/2026 e o código de "Vou assistir aqui" no Elite
 * passou a morar nestas tabelas (`packages/api/src/lib/attendance-ticket.ts`).
 * Os nomes ficaram para não mexer no contrato do app publicado.
 *
 * Estados em uso: `confirmed` (código em vigor) e `cancelled` (o torcedor
 * desmarcou). `pending` e `declined` são da reserva antiga: ficam no enum
 * (tirar valor de enum no Postgres é caro), ninguém grava nem lê.
 */
export const reservationStatusEnum = pgEnum('reservation_status', [
  'pending',
  'confirmed',
  'declined',
  'cancelled'
])

export type ReservationStatus =
  (typeof reservationStatusEnum.enumValues)[number]

/** O código em vigor do torcedor naquele jogo. Cancelado libera um novo. */
export const ACTIVE_RESERVATION_STATUSES = [
  'confirmed'
] as const satisfies readonly ReservationStatus[]

// O predicado do índice continua com `pending`, como está no banco: trocar
// recriaria o índice sem ganho (`status = 'confirmed'` já o usa).
const activeStatusPredicate = sql`status IN ('pending', 'confirmed')`

export const reservation = pgTable(
  'reservation',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    // O bar é derivado do evento. Guardar `bar_id` aqui criaria uma segunda
    // verdade que diverge no primeiro evento reatribuído.
    eventId: text('event_id')
      .notNull()
      .references(() => event.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    // `party_size` e `note` saíram do schema (WEB-401) e só deixam o banco
    // na migration seguinte, depois do deploy: o Drizzle lista toda coluna
    // do schema nos SELECTs, e o CI migra antes de publicar.
    status: reservationStatusEnum('status').default('confirmed').notNull(),
    // Texto da oferta da casa COPIADO na criação. Se o bar mudar a oferta
    // depois, o torcedor continua vendo o que aceitou. Nulo quando o bar não
    // tinha oferta configurada.
    offerSnapshot: text('offer_snapshot'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull()
  },
  (table) => [
    // Um pedido ativo por torcedor por jogo, garantido pelo banco: duas abas
    // enviando ao mesmo tempo não passam pela checagem da aplicação.
    uniqueIndex('reservation_active_user_event_key')
      .on(table.userId, table.eventId)
      .where(activeStatusPredicate),
    // Fila do bar: pedidos de um jogo, filtrados por estado, em ordem de
    // chegada. Também cobre o cascade de `event`.
    index('reservation_eventId_status_createdAt_idx').on(
      table.eventId,
      table.status,
      table.createdAt
    ),
    // Histórico do torcedor, do mais recente para o mais antigo.
    index('reservation_userId_createdAt_idx').on(
      table.userId,
      table.createdAt.desc()
    )
  ]
)

/**
 * Código que o torcedor apresenta no balcão. Sempre de um uso só
 * (`attendance-ticket.ts`).
 *
 * Único entre os códigos ATIVOS (`retired_at IS NULL`), não para sempre: um
 * código curto esgotaria o espaço se nunca voltasse a circular. Aposentar o
 * código — reserva recusada, cancelada ou janela de validação encerrada — é
 * responsabilidade de quem muda esse estado.
 *
 * `used_count` é mantido por trigger a partir de `reservation_code_use`
 * (migration 0033). Ninguém no TypeScript escreve esse número; a restrição
 * `used_count <= max_uses` faz o insert do uso excedente falhar no banco.
 *
 * Guardas da migration 0034, todas no banco:
 * - `used_count` só muda pela trigger de uso; escrita direta é recusada
 *   (`reservation_code_used_count_derived`).
 * - `max_uses` precisa ser igual a `reservation.party_size` na emissão e
 *   acompanha mudanças da reserva
 *   (`reservation_code_max_uses_matches_party_size`).
 * - Código aposentado não aceita uso novo
 *   (`reservation_code_use_code_not_retired`).
 */
export const reservationCode = pgTable(
  'reservation_code',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    code: text('code').notNull(),
    reservationId: text('reservation_id')
      .notNull()
      .references(() => reservation.id, { onDelete: 'cascade' }),
    // Sempre 1 no código de quem vai; códigos antigos da reserva guardam o
    // número de pessoas da época.
    maxUses: smallint('max_uses').notNull(),
    usedCount: smallint('used_count').default(0).notNull(),
    retiredAt: timestamp('retired_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull()
  },
  (table) => [
    // Busca por código na validação do bar. Parcial: só códigos ativos
    // disputam o valor.
    uniqueIndex('reservation_code_active_code_key')
      .on(table.code)
      .where(sql`retired_at IS NULL`),
    // No máximo um código ativo por reserva.
    uniqueIndex('reservation_code_active_reservation_key')
      .on(table.reservationId)
      .where(sql`retired_at IS NULL`),
    // Os índices acima são parciais; o cascade de `reservation` e o histórico
    // de códigos aposentados precisam deste.
    index('reservation_code_reservationId_idx').on(table.reservationId),
    check(
      'reservation_code_format',
      sql`${table.code} ~ ${sql.raw(`'${RESERVATION_CODE_PATTERN}'`)}` // sql-raw-permitido: constante de formato em CHECK
    ),
    check('reservation_code_max_uses_positive', sql`${table.maxUses} >= 1`),
    check(
      'reservation_code_used_count_bounds',
      sql`${table.usedCount} >= 0 AND ${table.usedCount} <= ${table.maxUses}`
    )
  ]
)

/**
 * Cada validação de um código, uma linha. Existe para auditoria (quando, por
 * quem) e para o desfazer curto: desfazer marca `undone_at` em vez de apagar,
 * e a trigger devolve o uso ao contador.
 */
export const reservationCodeUse = pgTable(
  'reservation_code_use',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    codeId: text('code_id')
      .notNull()
      .references(() => reservationCode.id, { onDelete: 'cascade' }),
    // Conta do bar que validou. Some a conta, fica o registro do uso.
    validatedByUserId: text('validated_by_user_id').references(() => user.id, {
      onDelete: 'set null'
    }),
    usedAt: timestamp('used_at', { withTimezone: true }).defaultNow().notNull(),
    undoneAt: timestamp('undone_at', { withTimezone: true }),
    // Lançado depois do jogo pelo bar que confirma pela comanda (WEB-412):
    // `used_at` é quando o dono lançou, não quando o torcedor esteve lá.
    late: boolean('late').default(false).notNull()
  },
  (table) => [
    index('reservation_code_use_codeId_usedAt_idx').on(
      table.codeId,
      table.usedAt
    ),
    index('reservation_code_use_validatedByUserId_idx').on(
      table.validatedByUserId
    ),
    check(
      'reservation_code_use_undone_after_used',
      sql`${table.undoneAt} IS NULL OR ${table.undoneAt} >= ${table.usedAt}`
    )
  ]
)

export const reservationRelations = relations(reservation, ({ one, many }) => ({
  event: one(event, { fields: [reservation.eventId], references: [event.id] }),
  user: one(user, { fields: [reservation.userId], references: [user.id] }),
  codes: many(reservationCode)
}))

export const reservationCodeRelations = relations(
  reservationCode,
  ({ one, many }) => ({
    reservation: one(reservation, {
      fields: [reservationCode.reservationId],
      references: [reservation.id]
    }),
    uses: many(reservationCodeUse)
  })
)

export const reservationCodeUseRelations = relations(
  reservationCodeUse,
  ({ one }) => ({
    code: one(reservationCode, {
      fields: [reservationCodeUse.codeId],
      references: [reservationCode.id]
    }),
    validatedBy: one(user, {
      fields: [reservationCodeUse.validatedByUserId],
      references: [user.id]
    })
  })
)
