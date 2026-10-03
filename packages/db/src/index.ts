import { AsyncLocalStorage } from 'node:async_hooks'
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
  console.info(
    `[db] connecting (${process.env.NODE_ENV ?? 'unknown'}): ${summary}`
  )

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

function createHttpDbInstance() {
  const { url } = resolveAndValidateDatabaseUrl()

  if (process.env.NODE_ENV !== 'production') {
    return createLocalDb(url)
  }

  return drizzleHttp(neon(url), { schema })
}

/**
 * WEB-201: o Workers proíbe usar numa requisição o I/O (socket, pool) aberto
 * em outra, então lá o banco nasce por requisição, sobre o Hyperdrive, e fica
 * neste escopo assíncrono. `db` e o banco do auth são proxies que resolvem a
 * instância da requisição atual — os imports de `db` não mudam.
 *
 * Fora do Worker (Vercel, dev, testes, scripts) não há escopo e vale a
 * instância global de sempre, criada no primeiro uso: a Vercel segue no driver
 * serverless do Neon até o corte (WEB-205), e o `@neondatabase/serverless` sai
 * com ela (WEB-206).
 */
type ScopedDb = ReturnType<typeof createLocalDb>
const requestDb = new AsyncLocalStorage<ScopedDb>()

/** Worker: uma instância por requisição sobre `env.HYPERDRIVE`. */
export function runWithDb<T>(connectionString: string, fn: () => T): T {
  // max 5: o Workers permite 6 conexões de saída simultâneas por requisição.
  // Pool e não Client: `transaction()` pega um cliente só dela e não se mistura
  // com queries paralelas da mesma requisição. Sem `end()`: o Hyperdrive
  // recolhe as conexões quando a requisição acaba, e o SSR em streaming
  // continua lendo depois que `fn` devolve a Response.
  const pool = new NodePostgresPool({ connectionString, max: 5 })
  return requestDb.run(drizzleNodePostgres(pool, { schema }), fn)
}

function scoped<T extends object>(fallback: () => T): T {
  let instance: T | undefined
  const current = (): T => {
    const scopedDb = requestDb.getStore() as T | undefined
    if (scopedDb) return scopedDb
    instance ??= fallback()
    return instance
  }
  return new Proxy({} as T, {
    get(_, key) {
      const target = current()
      const value = Reflect.get(target, key, target)
      // Métodos do Drizzle dependem de `this`; o construtor fica como está
      // para o `is()` do Drizzle continuar lendo o `entityKind` dele.
      return typeof value === 'function' && key !== 'constructor'
        ? value.bind(target)
        : value
    },
    has: (_, key) => Reflect.has(current(), key),
    getPrototypeOf: () => Reflect.getPrototypeOf(current())
  })
}

export function createHttpDb() {
  return scoped(createHttpDbInstance)
}

export const db = scoped(createDb)
export {
  and,
  count,
  eq,
  gte,
  inArray,
  isNull,
  notInArray,
  or,
  type SQL,
  sql
} from 'drizzle-orm'
