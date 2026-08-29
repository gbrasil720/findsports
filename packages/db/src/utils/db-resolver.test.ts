import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import {
  DatabaseUrlError,
  resolveAndValidateDatabaseUrl,
  resolveDatabaseUrl
} from './db-resolver'

describe('resolveDatabaseUrl', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
    delete process.env.LOAD_TEST_DATABASE_URL
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('throws when NODE_ENV is missing', () => {
    delete process.env.NODE_ENV
    expect(() => resolveDatabaseUrl()).toThrow(DatabaseUrlError)
  })

  it('throws when NODE_ENV is invalid', () => {
    process.env.NODE_ENV = 'staging'
    expect(() => resolveDatabaseUrl()).toThrow(DatabaseUrlError)
  })

  it('returns default localhost URL in development without DATABASE_URL', () => {
    process.env.NODE_ENV = 'development'
    delete process.env.DATABASE_URL
    const url = resolveDatabaseUrl()
    expect(url).toContain('localhost')
    expect(url).toContain('findsports_dev')
  })

  it('returns localhost URL in test mode', () => {
    process.env.NODE_ENV = 'test'
    delete process.env.DATABASE_URL
    const url = resolveDatabaseUrl()
    expect(url).toContain('localhost')
    expect(url).toContain('findsports_dev')
  })

  it('accepts DATABASE_URL in production', () => {
    process.env.NODE_ENV = 'production'
    process.env.DATABASE_URL =
      'postgres://user:pass@prod-host.example.com:5432/prod_db'
    const url = resolveDatabaseUrl()
    expect(url).toBe('postgres://user:pass@prod-host.example.com:5432/prod_db')
  })

  it('throws when DATABASE_URL is missing in production', () => {
    process.env.NODE_ENV = 'production'
    delete process.env.DATABASE_URL
    expect(() => resolveDatabaseUrl()).toThrow(DatabaseUrlError)
  })

  it('ignores a production DATABASE_URL in development', () => {
    process.env.NODE_ENV = 'development'
    process.env.DATABASE_URL =
      'postgres://user:pass@ep-cool.neon.sql.us-east-1.neon.tech:5432/findsports_dev'
    expect(resolveDatabaseUrl()).toBe(
      'postgres://findsports_dev:findsports_dev_local@localhost:5432/findsports_dev'
    )
  })

  it('ignores a production DATABASE_URL in test', () => {
    process.env.NODE_ENV = 'test'
    process.env.DATABASE_URL =
      'postgres://user:pass@ep-cool.neon.sql.us-east-1.neon.tech:5432/findsports_dev'
    expect(resolveDatabaseUrl()).toBe(
      'postgres://findsports_dev:findsports_dev_local@localhost:5432/findsports_dev'
    )
  })

  it('does not allow DATABASE_URL to override the development database', () => {
    process.env.NODE_ENV = 'development'
    process.env.DATABASE_URL =
      'postgres://user:pass@db.example.com:5432/findsports_dev'
    expect(resolveDatabaseUrl()).toBe(
      'postgres://findsports_dev:findsports_dev_local@localhost:5432/findsports_dev'
    )
  })

  it('accepts an explicit isolated load-test database on loopback', () => {
    process.env.NODE_ENV = 'test'
    process.env.LOAD_TEST_DATABASE_URL =
      'postgres://load:secret@localhost:5433/findsports_load_test'

    expect(resolveDatabaseUrl()).toBe(
      'postgres://load:secret@localhost:5433/findsports_load_test'
    )
  })

  it('rejects a remote load-test database', () => {
    process.env.NODE_ENV = 'test'
    process.env.LOAD_TEST_DATABASE_URL =
      'postgres://load:secret@example.com:5432/findsports_load_test'

    expect(() => resolveDatabaseUrl()).toThrow(DatabaseUrlError)
  })

  it('rejects a load-test URL targeting the normal development database', () => {
    process.env.NODE_ENV = 'test'
    process.env.LOAD_TEST_DATABASE_URL =
      'postgres://load:secret@localhost:5432/findsports_dev'

    expect(() => resolveDatabaseUrl()).toThrow(DatabaseUrlError)
  })
})

describe('resolveAndValidateDatabaseUrl', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
    delete process.env.LOAD_TEST_DATABASE_URL
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('returns sanitized summary without password', () => {
    process.env.NODE_ENV = 'development'
    const { summary } = resolveAndValidateDatabaseUrl()
    expect(summary).not.toContain('findsports_dev_local')
    expect(summary).toContain('localhost')
  })

  it('throws on invalid NODE_ENV', () => {
    process.env.NODE_ENV = 'staging'
    expect(() => resolveAndValidateDatabaseUrl()).toThrow(DatabaseUrlError)
  })
})

describe('DatabaseUrlError', () => {
  it('is an Error subclass', () => {
    const err = new DatabaseUrlError('test')
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe('DatabaseUrlError')
    expect(err.message).toBe('test')
  })
})
