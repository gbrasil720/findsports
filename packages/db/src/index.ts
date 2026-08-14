import { env } from '@findsports_oficial/env/server'
import { neon, Pool } from '@neondatabase/serverless'
import { drizzle as drizzleHttp } from 'drizzle-orm/neon-http'
import { drizzle as drizzleWebSocket } from 'drizzle-orm/neon-serverless'

import * as schema from './schema'

export * from './schema'

export function createDb() {
  const pool = new Pool({ connectionString: env.DATABASE_URL })
  return drizzleWebSocket(pool, { schema })
}

export function createHttpDb() {
  return drizzleHttp(neon(env.DATABASE_URL), { schema })
}

export const db = createDb()
export { and, count, eq, gte, sql } from 'drizzle-orm'
