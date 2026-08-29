import { neon, neonConfig, Pool } from '@neondatabase/serverless'
import { drizzle as drizzleHttp } from 'drizzle-orm/neon-http'
import { drizzle as drizzleWebSocket } from 'drizzle-orm/neon-serverless'
import { drizzle as drizzleNodePostgres } from 'drizzle-orm/node-postgres'
import { Pool as NodePostgresPool } from 'pg'
import * as schema from './schema'
import { resolveAndValidateDatabaseUrl } from './utils/db-resolver'

export * from './schema'

/**
 * ESC-04: em serverless, cada instância criava seu próprio pool WebSocket e
 * segurava as conexões abertas. O número de conexões acompanhava o número de
 * instâncias, não o de requisições — e o limite do Neon era atingido bem antes
 * de qualquer limite de CPU, no pico.
 *
 * Com esta opção, `Pool.query()` vai por HTTP fetch: a consulta não abre nem
 * segura conexão nenhuma. O driver do Drizzle só faz checkout de cliente de
 * verdade dentro de `transaction()`, então as transações continuam
 * funcionando normalmente — e passam a ser o único caso que consome conexão.
 *
 * Só vale globalmente, e apenas enquanto ninguém registrar listener de
 * `connect`/`acquire`/`release`/`remove` no Pool. Marcada como experimental
 * pelo driver: se precisar voltar atrás, basta remover esta linha — o
 * comportamento retorna ao pool WebSocket, agora limitado por `max`.
 */
neonConfig.poolQueryViaFetch = true

function createLocalDb(url: string) {
  return drizzleNodePostgres(new NodePostgresPool({ connectionString: url }), {
    schema
  })
}

function warnIfNotPooledHost(url: string) {
  try {
    const { hostname } = new URL(url)
    if (!hostname.includes('-pooler.')) {
      console.warn(
        `[db] DATABASE_URL aponta para "${hostname}", que não é o endpoint com pooler do Neon. ` +
          'Em serverless isso volta a expor o limite de conexões diretas. ' +
          'Use o host com sufixo "-pooler".'
      )
    }
  } catch {
    // URL inválida já é tratada por resolveAndValidateDatabaseUrl
  }
}

export function createDb() {
  const { url, summary } = resolveAndValidateDatabaseUrl()
  console.info(`[db] connecting (${process.env.NODE_ENV ?? 'unknown'}): ${summary}`)

  if (process.env.NODE_ENV !== 'production') {
    return createLocalDb(url)
  }

  warnIfNotPooledHost(url)

  return drizzleWebSocket(
    new Pool({
      connectionString: url,
      // Com `poolQueryViaFetch`, só transação consome conexão. Um teto baixo
      // impede que uma instância acumule sockets; 2 evita que duas transações
      // concorrentes na mesma instância fiquem em fila atrás uma da outra.
      max: 2,
      // Instância serverless congelada não deve manter socket vivo à toa.
      idleTimeoutMillis: 10_000,
      // Falhar rápido é melhor do que pendurar a requisição esperando vaga.
      connectionTimeoutMillis: 10_000
    }),
    { schema }
  )
}

export function createHttpDb() {
  const { url } = resolveAndValidateDatabaseUrl()

  if (process.env.NODE_ENV !== 'production') {
    return createLocalDb(url)
  }

  return drizzleHttp(neon(url), { schema })
}

export const db = createDb()
export { and, count, eq, gte, sql } from 'drizzle-orm'
