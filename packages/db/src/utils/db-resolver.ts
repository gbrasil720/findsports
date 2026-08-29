import { z } from 'zod'

const LocalhostSchema = z.union([
  z.literal('localhost'),
  z.literal('127.0.0.1'),
  z.literal('::1')
])

const DevDatabaseConfig = z.object({
  host: LocalhostSchema,
  port: z.number().int().positive(),
  database: z.enum(['findsports_dev', 'findsports_load_test'])
})

const DefaultDevUrl =
  'postgres://findsports_dev:findsports_dev_local@localhost:5432/findsports_dev'

const LoadTestDatabaseConfig = z.object({
  host: LocalhostSchema,
  port: z.number().int().positive(),
  database: z.literal('findsports_load_test')
})

const NeonHostPattern = /\.neon\.sql\./i

function parseUrl(url: string) {
  const parsed = new URL(url)
  const port = parsed.port ? Number(parsed.port) : 5432
  return {
    host: parsed.hostname.replace(/^\[|\]$/g, ''),
    port,
    database: parsed.pathname.slice(1)
  }
}

function isNeonHost(host: string) {
  return NeonHostPattern.test(host)
}

function sanitizeUrl(url: string) {
  try {
    const parsed = new URL(url)
    parsed.password = ''
    return parsed.toString()
  } catch {
    return url.replace(/\/\/[^:]+:[^@]+@/, '//***:***@')
  }
}

export class DatabaseUrlError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DatabaseUrlError'
  }
}

/**
 * Resolve a safe DATABASE_URL based on NODE_ENV.
 *
 * - development → localhost findsports_dev (fail-closed)
 * - test → localhost findsports_dev (fail-closed)
 * - production → DATABASE_URL from environment
 * - missing/other → throws
 *
 * Never falls back to remote URLs for dev/test.
 */
export function resolveDatabaseUrl(): string {
  const nodeEnv = process.env.NODE_ENV

  if (
    !nodeEnv ||
    !z.enum(['development', 'production', 'test']).safeParse(nodeEnv).success
  ) {
    throw new DatabaseUrlError(
      `Invalid or missing NODE_ENV: "${nodeEnv ?? 'undefined'}". ` +
        'Must be one of: development, production, test.'
    )
  }

  if (nodeEnv === 'production') {
    const url = process.env.DATABASE_URL
    if (!url) {
      throw new DatabaseUrlError(
        'DATABASE_URL is required in production. Set it via your deployment environment.'
      )
    }
    return url
  }

  const loadTestUrl = process.env.LOAD_TEST_DATABASE_URL
  if (loadTestUrl) {
    let parsed: ReturnType<typeof parseUrl>
    try {
      parsed = parseUrl(loadTestUrl)
    } catch {
      throw new DatabaseUrlError('LOAD_TEST_DATABASE_URL must be a valid URL.')
    }

    const result = LoadTestDatabaseConfig.safeParse(parsed)
    if (!result.success) {
      throw new DatabaseUrlError(
        'Refusing unsafe LOAD_TEST_DATABASE_URL. ' +
          'Load tests require a loopback host and database=findsports_load_test.'
      )
    }
    return loadTestUrl
  }

  // Development and test are intentionally pinned to the disposable Docker
  // database. The web app still loads its production DATABASE_URL from .env,
  // so consulting it here would either block local startup or risk pointing a
  // development process at production data.
  const url = DefaultDevUrl
  const parsed = parseUrl(url)

  const result = DevDatabaseConfig.safeParse(parsed)
  if (!result.success) {
    const sanitized = sanitizeUrl(url)
    throw new DatabaseUrlError(
      `Development/test database URL is invalid: ${sanitized}\n` +
        `Expected: host=localhost, database=findsports_dev.\n` +
        `Issues: ${result.error.issues.map((i) => i.message).join(', ')}\n` +
        'Start the local database: docker compose up -d'
    )
  }

  if (isNeonHost(parsed.host)) {
    throw new DatabaseUrlError(
      `Refusing to connect to Neon host "${parsed.host}" in ${nodeEnv}. ` +
        'Local development must use the Docker Postgres instance.\n' +
        'Start the local database: docker compose up -d'
    )
  }

  return url
}

/**
 * Validate that the resolved URL points to a safe local target.
 * Returns a sanitized summary (no password) for logging.
 */
export function resolveAndValidateDatabaseUrl(): {
  url: string
  summary: string
} {
  const url = resolveDatabaseUrl()
  const nodeEnv = process.env.NODE_ENV ?? 'unknown'

  if (nodeEnv !== 'production') {
    const parsed = parseUrl(url)
    const result = DevDatabaseConfig.safeParse(parsed)
    if (!result.success) {
      throw new DatabaseUrlError(
        `Database URL validation failed for ${nodeEnv}.\n` +
          `Issues: ${result.error.issues.map((i) => i.message).join(', ')}`
      )
    }
  }

  return {
    url,
    summary: sanitizeUrl(url)
  }
}
