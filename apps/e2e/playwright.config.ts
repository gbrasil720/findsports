import { defineConfig, devices } from '@playwright/test'
import { APP_PORT, BASE_URL, SAO_PAULO, SERVER_ENV, STUB_URL } from './env'

/**
 * Suíte E2E (WEB-174). Como rodar e escrever teste: `docs/e2e.md`.
 *
 * Duas fases. Os projetos `desktop` e `mobile` rodam em paralelo tudo que lê
 * `app_config` com os padrões. Arquivos `*.serial.e2e.ts` mexem em estado
 * global (`app_config`), então rodam depois, um teste por vez.
 */
const SERIAL = /\.serial\.e2e\.ts$/
const CI = Boolean(process.env.CI)

export default defineConfig({
  testDir: './tests',
  testMatch: /\.e2e\.ts$/,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  workers: CI ? 2 : undefined,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    geolocation: SAO_PAULO,
    permissions: ['geolocation'],
    launchOptions: {
      // Sem rede externa: o que não for local nem interceptado por
      // `page.route` não resolve DNS e falha na hora.
      args: [
        '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1'
      ]
    }
  },
  projects: [
    { name: 'setup', testMatch: /\.setup\.ts$/ },
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: SERIAL,
      dependencies: ['setup']
    },
    {
      name: 'mobile',
      use: { ...devices['Pixel 7'] },
      testIgnore: SERIAL,
      dependencies: ['setup']
    },
    {
      name: 'desktop-serial',
      use: { ...devices['Desktop Chrome'] },
      testMatch: SERIAL,
      workers: 1,
      dependencies: ['desktop', 'mobile']
    },
    {
      name: 'mobile-serial',
      use: { ...devices['Pixel 7'] },
      testMatch: SERIAL,
      workers: 1,
      dependencies: ['desktop-serial']
    }
  ],
  webServer: [
    {
      command: 'bun stubs/server.ts',
      url: `${STUB_URL}/locationiq/calls`,
      env: SERVER_ENV,
      reuseExistingServer: false
    },
    {
      // `vite dev`, e não o build: o build usa o driver HTTP do Neon, que não
      // fala com Postgres local. Migra e semeia antes de subir.
      command: [
        'cd ../../packages/db',
        'bunx drizzle-kit migrate',
        'bun src/seed/sports.ts',
        'bun src/seed/teams.ts',
        'cd ../../apps/web',
        `bunx vite dev --port ${APP_PORT} --strictPort --host 127.0.0.1`
      ].join(' && '),
      url: BASE_URL,
      env: SERVER_ENV,
      timeout: 180_000,
      reuseExistingServer: false
    }
  ]
})
