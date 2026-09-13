import { relations, sql } from 'drizzle-orm'
import {
  check,
  index,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex
} from 'drizzle-orm/pg-core'
import { user } from './auth'
import { event } from './platform'

/**
 * Reserva de mesa (WEB-119). Só a camada de dados: quem pode criar, aceitar,
 * cancelar ou validar é decidido nos procedimentos tRPC dos tickets filhos.
 *
 * Estados: `pending` (pedido do torcedor, aguardando o bar), `confirmed`,
 * `declined` (o bar recusou) e `cancelled` (o torcedor desistiu).
 */
export const reservationStatusEnum = pgEnum('reservation_status', [
  'pending',
  'confirmed',
  'declined',
  'cancelled'
])

export type ReservationStatus =
  (typeof reservationStatusEnum.enumValues)[number]

/**
 * Estados que ocupam a vaga do torcedor naquele jogo. Recusado ou cancelado
 * libera um novo pedido.
 */
export const ACTIVE_RESERVATION_STATUSES = [
  'pending',
  'confirmed'
] as const satisfies readonly ReservationStatus[]

/** Limite da observação livre. Recado para o bar, não conversa. */
export const RESERVATION_NOTE_MAX_LENGTH = 280

/** Formato do código: maiúsculas e dígitos, curto o bastante para ditar. */
export const RESERVATION_CODE_PATTERN = '^[A-Z0-9]{4,12}$'

// Os `sql.raw` deste arquivo só inlinam constantes do próprio código em DDL:
// predicado de índice e CHECK não aceitam parâmetro, e escrever o literal à
// mão criaria uma segunda cópia do valor.
const activeStatusList = ACTIVE_RESERVATION_STATUSES.map((s) => `'${s}'`).join(
  ', '
)
const activeStatusPredicate = sql.raw(`status IN (${activeStatusList})`) // sql-raw-permitido: constante em DDL

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
    partySize: smallint('party_size').notNull(),
    note: text('note'),
    status: reservationStatusEnum('status').default('pending').notNull(),
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
    ),
    check('reservation_party_size_positive', sql`${table.partySize} >= 1`),
    check(
      'reservation_note_length',
      sql`${table.note} IS NULL OR char_length(${table.note}) <= ${sql.raw(String(RESERVATION_NOTE_MAX_LENGTH))}` // sql-raw-permitido: constante de limite em CHECK
    )
  ]
)

/**
 * Código que o torcedor apresenta no bar.
 *
 * Único entre os códigos ATIVOS (`retired_at IS NULL`), não para sempre: um
 * código curto esgotaria o espaço se nunca voltasse a circular. Aposentar o
 * código — reserva recusada, cancelada ou janela de validação encerrada — é
 * responsabilidade de quem muda esse estado.
 *
 * `used_count` é mantido por trigger a partir de `reservation_code_use`
 * (migration 0033). Ninguém no TypeScript escreve esse número; a restrição
 * `used_count <= max_uses` faz o insert do uso excedente falhar no banco.
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
    // Igual a `reservation.party_size` no momento da emissão.
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
    undoneAt: timestamp('undone_at', { withTimezone: true })
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
