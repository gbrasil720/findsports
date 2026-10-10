import { defineConfig, devices } from '@playwright/test'

/**
 * Suíte contra o bundle real do Worker, em workerd (`docs/e2e.md`).
 *
 * A suíte principal roda em `vite dev`, que serve `public/` de outro jeito:
 * o Workers assets responde `/offline.html` com 307, o `vite dev` com 200. Foi
 * essa diferença que escondeu a WEB-269. Aqui só entra o que depende de como
 * o Worker serve arquivo estático; o resto continua na suíte principal.
 *
 * O servidor é do próprio spec, e não um `webServer`, porque o teste precisa
 * derrubá-lo para a rede falhar de verdade.
 */
const CI = Boolean(process.env.CI)

export default defineConfig({
  testDir: './worker',
  testMatch: /\.e2e\.ts$/,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 10_000 },
  reporter: CI ? [['github']] : 'list',
  projects: [{ name: 'worker', use: { ...devices['Desktop Chrome'] } }]
})
