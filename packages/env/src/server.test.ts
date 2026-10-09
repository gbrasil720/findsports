import { describe, expect, it } from 'bun:test'

const productionEnv = {
  PATH: process.env.PATH,
  NODE_ENV: 'production',
  DATABASE_URL: 'postgres://user:pass@prod.example.com/prod',
  BETTER_AUTH_SECRET: 'x'.repeat(32),
  BETTER_AUTH_URL: 'https://onside.sh',
  CORS_ORIGIN: 'https://onside.sh'
}

function loadServerEnv(extra: Record<string, string>) {
  // Processo novo: o módulo valida na carga, e o cache de import do bun
  // devolveria a primeira avaliação.
  return Bun.spawnSync(
    [
      'bun',
      '-e',
      `await import(${JSON.stringify(`${import.meta.dir}/server.ts`)})`
    ],
    { env: { ...productionEnv, ...extra }, cwd: import.meta.dir }
  )
}

describe('test-only switches (WEB-174)', () => {
  it('boots in production without them', () => {
    expect(loadServerEnv({}).exitCode).toBe(0)
  })

  it('refuses any E2E switch in production', () => {
    for (const key of [
      'E2E_DATABASE_URL',
      'E2E_EMAIL_OUTBOX',
      'E2E_DISABLE_CACHES',
      'LOCATIONIQ_BASE_URL',
      'STRIPE_API_BASE_URL'
    ]) {
      const value = key === 'E2E_DISABLE_CACHES' ? '1' : 'http://127.0.0.1:1'
      const result = loadServerEnv({ [key]: value })
      expect(result.exitCode).not.toBe(0)
      expect(result.stderr.toString()).toContain(key)
    }
  })
})

describe('preview switches', () => {
  const preview = 'https://onside-web-preview.example.workers.dev'

  it('accepts EMAIL_DELIVERY=console outside the production domain', () => {
    expect(
      loadServerEnv({ EMAIL_DELIVERY: 'console', PUBLIC_APP_URL: preview })
        .exitCode
    ).toBe(0)
  })

  it('refuses EMAIL_DELIVERY=console on onside.sh', () => {
    for (const url of ['https://www.onside.sh', 'https://onside.sh']) {
      const result = loadServerEnv({
        EMAIL_DELIVERY: 'console',
        PUBLIC_APP_URL: url
      })
      expect(result.exitCode).not.toBe(0)
      expect(result.stderr.toString()).toContain('EMAIL_DELIVERY')
    }
  })

  it('recusa chave viva do Stripe fora do domínio de produção', () => {
    const preview = loadServerEnv({
      STRIPE_SECRET_KEY: 'sk_live_exemplo',
      PUBLIC_APP_URL: 'https://onside-web-preview.example.workers.dev'
    })
    expect(preview.exitCode).not.toBe(0)
    expect(preview.stderr.toString()).toContain('STRIPE_SECRET_KEY')

    expect(
      loadServerEnv({
        STRIPE_SECRET_KEY: 'sk_live_exemplo',
        PUBLIC_APP_URL: 'https://www.onside.sh'
      }).exitCode
    ).toBe(0)
    expect(
      loadServerEnv({
        STRIPE_SECRET_KEY: 'sk_test_exemplo',
        PUBLIC_APP_URL: 'https://onside-web-preview.example.workers.dev'
      }).exitCode
    ).toBe(0)
  })
})
