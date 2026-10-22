import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  index,
  integer,
  numeric,
  pgTable,
  smallint,
  text,
  timestamp
} from 'drizzle-orm/pg-core'
import { user } from './auth'
import { bar, event } from './platform'

/**
 * Uma execução de IA (WEB-424): um pedido do recomendador ou uma mensagem do
 * chat (WEB-400), com todas as chamadas ao modelo que ela precisou (ferramentas,
 * nova tentativa, troca de modelo) somadas numa linha. `run_id` vai como
 * metadado ao AI Gateway, então o log do Gateway e esta linha se encontram.
 *
 * É daqui que saem os tetos: o gasto do mês (`cost_usd`), as chamadas do dia
 * por pessoa e as mensagens do chat que descontam do limite (`useful`).
 *
 * Apagar a conta não apaga a linha (`set null`): o gasto do mês continua
 * somando, e a linha já não diz de quem era.
 */
export const aiRun = pgTable(
  'ai_run',
  {
    runId: text('run_id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id').references(() => user.id, {
      onDelete: 'set null'
    }),
    feature: text('feature', { enum: ['recommender', 'chat'] }).notNull(),
    // Braço do teste ("a", "b", "c"), sorteado por pessoa.
    variant: text('variant').notNull(),
    // O modelo do braço sorteado e o que respondeu de fato (outro, depois de
    // falhar duas vezes; nulo se nenhum respondeu).
    assignedModel: text('assigned_model').notNull(),
    servedModel: text('served_model'),
    latencyMs: integer('latency_ms').notNull().default(0),
    tokensIn: integer('tokens_in').notNull().default(0),
    tokensOut: integer('tokens_out').notNull().default(0),
    costUsd: numeric('cost_usd', {
      precision: 12,
      scale: 6,
      mode: 'number'
    })
      .notNull()
      .default(0),
    status: text('status', {
      enum: ['ok', 'timeout', 'error', 'fallback']
    }).notNull(),
    cacheHit: boolean('cache_hit').notNull().default(false),
    // Mensagem do chat que gerou resposta útil: só ela desconta do limite
    // (10 por dia, 100 por mês). Erro, demora e tentativa interna não contam.
    useful: boolean('useful').notNull().default(false),
    // Polegar da resposta (1 ou -1), a métrica secundária do teste.
    feedback: smallint('feedback'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull()
  },
  (table) => [
    // Limites por pessoa (dia e mês) e o cascade de `user`.
    index('ai_run_user_created_idx').on(table.userId, table.createdAt),
    // Gasto do mês, para a trava própria.
    index('ai_run_created_idx').on(table.createdAt),
    check(
      'ai_run_feedback',
      sql`${table.feedback} IS NULL OR ${table.feedback} IN (-1, 1)`
    )
  ]
)

/**
 * O que a pessoa fez depois da resposta (métrica principal do teste do chat):
 * abriu um bar citado, marcou "Vou assistir", pediu a rota.
 */
export const aiAction = pgTable(
  'ai_action',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    runId: text('run_id')
      .notNull()
      .references(() => aiRun.runId, { onDelete: 'cascade' }),
    // `call` e `remind` vêm do "Confirmar" de uma proposta da IA (R24).
    kind: text('kind', {
      enum: ['open_bar', 'going', 'route', 'call', 'remind']
    }).notNull(),
    barId: text('bar_id'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull()
  },
  (table) => [index('ai_action_run_idx').on(table.runId)]
)

/**
 * O que a IA propôs fazer (R24, `marcar_vou_assistir` e `lembrar`): nada muda
 * sem o "Confirmar" do torcedor, que chega em `ai.confirm` com este id. Vale
 * uma vez e só para o dono do `run_id` (`used_at`).
 */
export const aiProposal = pgTable(
  'ai_proposal',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    runId: text('run_id')
      .notNull()
      .references(() => aiRun.runId, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    barId: text('bar_id')
      .notNull()
      .references(() => bar.id, { onDelete: 'cascade' }),
    eventId: text('event_id')
      .notNull()
      .references(() => event.id, { onDelete: 'cascade' }),
    // "Vou assistir" entra na proposta de `marcar_vou_assistir`; o lembrete,
    // em todas; o amigo, só se o pedido chamou um amigo aceito.
    offersGoing: boolean('offers_going').notNull(),
    friendId: text('friend_id').references(() => user.id, {
      onDelete: 'set null'
    }),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull()
  },
  (table) => [index('ai_proposal_run_idx').on(table.runId)]
)
