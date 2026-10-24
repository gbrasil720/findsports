import { AsyncLocalStorage } from 'node:async_hooks'
import { drizzle } from 'drizzle-orm/node-postgres'
import { defaults, Pool } from 'pg'
import * as schema from './schema'
import { resolveAndValidateDatabaseUrl } from './utils/db-resolver'

export * from './schema'

// `Date` vai ao Postgres em UTC. O padrão do `pg` é o fuso do processo
// ("…23:59:59.999-03:00"), e comparado com `timestamp` sem fuso, onde guardamos
// UTC, o Postgres descarta o deslocamento: numa máquina em Brasília o fim do
// dia virava 20:59 UTC e o jogo da noite saía do período. O Worker roda em UTC.
defaults.parseInputDatesAsUTC = true

export function createDb() {
  const { url, summary } = resolveAndValidateDatabaseUrl()
  console.info(
    `[db] connecting (${process.env.NODE_ENV ?? 'unknown'}): ${summary}`
  )
  return drizzle(new Pool({ connectionString: url }), { schema })
}

/**
 * WEB-201: o Workers proíbe usar numa requisição o I/O (socket, pool) aberto
 * em outra, então lá o banco nasce por requisição, sobre o Hyperdrive, e fica
 * neste escopo assíncrono. `db` é um proxy que resolve a instância da
 * requisição atual — os imports de `db` não mudam.
 *
 * Fora do Worker (dev, testes, scripts) não há escopo e vale uma instância
 * global, criada no primeiro uso.
 */
type Db = ReturnType<typeof createDb>
const requestDb = new AsyncLocalStorage<Db>()
let globalDb: Db | undefined
function currentDb(): Db {
  const scopedDb = requestDb.getStore()
  if (scopedDb) return scopedDb
  globalDb ??= createDb()
  return globalDb
}

/** Worker: uma instância por requisição sobre `env.HYPERDRIVE`. */
export function runWithDb<T>(connectionString: string, fn: () => T): T {
  // max 5: o Workers permite 6 conexões de saída simultâneas por requisição.
  // Pool e não Client: `transaction()` pega um cliente só dela e não se mistura
  // com queries paralelas da mesma requisição. Sem `end()`: o Hyperdrive
  // recolhe as conexões quando a requisição acaba, e o SSR em streaming
  // continua lendo depois que `fn` devolve a Response.
  const pool = new Pool({ connectionString, max: 5 })
  return requestDb.run(drizzle(pool, { schema }), fn)
}

export const db = new Proxy({} as Db, {
  get(_, key) {
    const target = currentDb()
    const value = Reflect.get(target, key, target)
    // Métodos do Drizzle dependem de `this`; o construtor fica como está
    // para o `is()` do Drizzle continuar lendo o `entityKind` dele.
    return typeof value === 'function' && key !== 'constructor'
      ? value.bind(target)
      : value
  },
  has: (_, key) => Reflect.has(currentDb(), key),
  getPrototypeOf: () => Reflect.getPrototypeOf(currentDb())
})
export {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lte,
  notInArray,
  or,
  type SQL,
  sql
} from 'drizzle-orm'
