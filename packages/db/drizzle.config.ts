import dotenv from 'dotenv'
import { defineConfig } from 'drizzle-kit'
import { resolveDatabaseUrl } from './src/utils/db-resolver'

// Decide NODE_ENV before loading any .env file (spec section 13.3)
const nodeEnv = process.env.NODE_ENV
if (!nodeEnv || !['development', 'production', 'test'].includes(nodeEnv)) {
  throw new Error(
    `Invalid or missing NODE_ENV: "${nodeEnv ?? 'undefined'}". ` +
      'Must be one of: development, production, test.'
  )
}

// Only load .env for production; dev/test use resolver defaults
if (nodeEnv === 'production') {
  dotenv.config({
    path: '../../apps/web/.env'
  })
}

export default defineConfig({
  schema: './src/schema',
  out: './src/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: resolveDatabaseUrl()
  }
})
