import { z } from 'zod'

const LocalhostSchema = z.union([
  z.literal('localhost'),
  z.literal('127.0.0.1'),
  z.literal('::1')
])

/**
 * Banco do E2E (WEB-174): `findsports_e2e` ou `findsports_e2e_<sufixo>`, para
 * worktrees diferentes rodarem a suíte em paralelo cada uma no seu banco.
 */
const E2eDatabaseName = z.string().regex(/^findsports_e2e(_[a-z0-9_]+)?$/)

const DevDatabaseConfig = z.object({
  host: LocalhostSchema,
  port: z.number().int().positive(),
  database: z.union([
    z.enum(['findsports_dev', 'findsports_load_test']),
    E2eDatabaseName
  ])
})

const DefaultDevUrl =
  'postgres://findsports_dev:findsports_dev_local@localhost:5432/findsports_dev'

const LoadTestDatabaseConfig = z.object({
  host: LocalhostSchema,
  port: z.number().int().positive(),
  database: z.literal('findsports_load_test')
})

const E2eDatabaseConfig = z.object({
  host: LocalhostSchema,
  port: z.number().int().positive(),
  database: E2eDatabaseName
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

function disposableUrl(
  url: string,
  name: string,
  schema: z.ZodType,
  requirement: string
): string {
  let parsed: ReturnType<typeof parseUrl>
  try {
    parsed = parseUrl(url)
  } catch {
    throw new DatabaseUrlError(`${name} must be a valid URL.`)
  }
  if (!schema.safeParse(parsed).success) {
    throw new DatabaseUrlError(`Refusing unsafe ${name}. ${requirement}`)
  }
  return url
}

/**
 * Resolve a safe DATABASE_URL based on NODE_ENV.
 *
 * - development → localhost findsports_dev (fail-closed)
 * - test → localhost findsports_dev (fail-closed)
 * - E2E_DATABASE_URL / LOAD_TEST_DATABASE_URL override both, loopback only
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

  // E2E vence o load test: o servidor do Playwright roda em `development` e
  // não pode cair no findsports_dev por acaso (WEB-174).
  const e2eUrl = process.env.E2E_DATABASE_URL
  if (e2eUrl) {
    return disposableUrl(
      e2eUrl,
      'E2E_DATABASE_URL',
      E2eDatabaseConfig,
      'E2E tests require a loopback host and database=findsports_e2e[_<suffix>].'
    )
  }

  const loadTestUrl = process.env.LOAD_TEST_DATABASE_URL
  if (loadTestUrl) {
    return disposableUrl(
      loadTestUrl,
      'LOAD_TEST_DATABASE_URL',
      LoadTestDatabaseConfig,
      'Load tests require a loopback host and database=findsports_load_test.'
    )
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

/** Opt in only for the same disposable target that createDb actually resolves. */
export function isDisposableTestDatabase(): boolean {
  if (
    process.env.NODE_ENV !== 'test' ||
    process.env.RUN_DISPOSABLE_DB_TESTS !== '1'
  ) {
    return false
  }

  try {
    // In test mode the resolver rejects remote hosts and permits the load-test
    // database only through LOAD_TEST_DATABASE_URL, never through DATABASE_URL.
    const url = new URL(resolveDatabaseUrl())
    return (
      ['postgres:', 'postgresql:'].includes(url.protocol) &&
      url.pathname === '/findsports_load_test'
    )
  } catch {
    return false
  }
}
