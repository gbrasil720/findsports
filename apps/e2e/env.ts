import { fileURLToPath } from 'node:url'

/**
 * Tudo que a suíte E2E liga, numa fonte só: config do Playwright, stub e
 * fixtures leem daqui. Porta e banco vêm de variável para várias worktrees
 * rodarem a suíte ao mesmo tempo (ver `docs/e2e.md`).
 */

export const APP_PORT = Number(process.env.E2E_PORT ?? 3201)
export const STUB_PORT = Number(process.env.E2E_STUB_PORT ?? 3202)

// 127.0.0.1, e não localhost: no macOS o `localhost` do Vite pode abrir só em
// ::1, e o cookie de sessão precisa do mesmo host em todo lugar.
export const BASE_URL = `http://127.0.0.1:${APP_PORT}`
export const STUB_URL = `http://127.0.0.1:${STUB_PORT}`

export const DATABASE_URL =
  process.env.E2E_DATABASE_URL ??
  'postgres://findsports_e2e:findsports_e2e_local@127.0.0.1:5434/findsports_e2e'

export const OUTBOX_FILE = fileURLToPath(
  new URL('./.outbox/emails.jsonl', import.meta.url)
)

/** Formato do Standard Webhooks que a Dodo usa: `whsec_` + base64. */
export const DODO_WEBHOOK_SECRET = `whsec_${Buffer.from('e2e-only-dodo-webhook-secret').toString('base64')}`

/** Domínio público falso do bucket de fotos; `fixtures/media.ts` serve a leitura. */
export const MEDIA_PUBLIC_ORIGIN = 'https://media.e2e.test'

/** Centro de São Paulo: geolocalização do navegador, stub e bares semeados. */
export const SAO_PAULO = { latitude: -23.5505, longitude: -46.6333 }

/**
 * Ambiente do servidor de E2E. Toda chave que o `.env` de quem roda local
 * pode trazer com valor real está aqui, nem que seja vazia: o dotenv não
 * sobrescreve variável que já existe, então vazio aqui vence o `.env`.
 */
export const SERVER_ENV: Record<string, string> = {
  NODE_ENV: 'development',
  E2E_DATABASE_URL: DATABASE_URL,
  // Exigida pelo esquema de `packages/env`; o resolver usa a de cima.
  DATABASE_URL,
  LOAD_TEST_DATABASE_URL: '',
  BETTER_AUTH_SECRET: 'e2e-only-secret-000000000000000000000000',
  BETTER_AUTH_URL: BASE_URL,
  PUBLIC_APP_URL: BASE_URL,
  CORS_ORIGIN: BASE_URL,
  AUTH_DEV_TRUSTED_ORIGIN: '',
  E2E_EMAIL_OUTBOX: OUTBOX_FILE,
  E2E_DISABLE_CACHES: '1',
  RESEND_API_KEY: '',
  RESEND_FROM_EMAIL: '',
  LOCATIONIQ_API_KEY: 'e2e-fake-key',
  LOCATIONIQ_BASE_URL: STUB_URL,
  // O PUT para `e2e.r2.cloudflarestorage.com` nunca sai do navegador: o
  // `fixtures/media.ts` responde. A assinatura com chave falsa é a real.
  CF_ACCOUNT_ID: 'e2e',
  R2_MEDIA_ACCESS_KEY_ID: 'e2e-fake-key',
  R2_MEDIA_SECRET_ACCESS_KEY: 'e2e-fake-secret',
  MEDIA_PUBLIC_ORIGIN,
  DODO_PAYMENTS_API_KEY: 'e2e-fake-key',
  DODO_PAYMENTS_WEBHOOK_SECRET: DODO_WEBHOOK_SECRET,
  // Lida pelo `stubs/dodo-api.mjs`, não pelo app.
  E2E_DODO_API_URL: `${STUB_URL}/dodo`,
  CRON_SECRET: '',
  LAUNCH_ADMISSION_MODE: 'invite-only',
  KV_REST_API_URL: '',
  KV_REST_API_TOKEN: '',
  UPSTASH_REDIS_REST_URL: '',
  UPSTASH_REDIS_REST_TOKEN: '',
  VITE_MAP_TILES_URL: `${STUB_URL}/tiles.pmtiles`,
  VITE_POSTHOG_KEY: ''
}
