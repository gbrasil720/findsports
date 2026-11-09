import { type ChildProcess, spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'

/**
 * Arquivo estático servido pelo Worker de verdade (`vite preview --mode
 * cloudflare`, depois de `bun run build:cf` em `apps/web`).
 */
const PORT = Number(process.env.E2E_WORKER_PORT ?? 3203)
const ORIGIN = `http://127.0.0.1:${PORT}`
const WEB_DIR = fileURLToPath(new URL('../../web', import.meta.url))

let server: ChildProcess | undefined

function stopServer() {
  if (!server?.pid) return
  // O `bunx` sobe o vite, que sobe o workerd: derruba o grupo inteiro.
  try {
    process.kill(-server.pid, 'SIGKILL')
  } catch {
    // Já saiu.
  }
  server = undefined
}

async function waitUntil(
  check: () => Promise<boolean>,
  what: string,
  timeoutMs = 90_000
) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await check().catch(() => false)) return
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error(`${what} não aconteceu em ${timeoutMs} ms`)
}

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  server = spawn(
    'bunx',
    [
      'vite',
      'preview',
      '--mode',
      'cloudflare',
      '--host',
      '127.0.0.1',
      '--port',
      String(PORT),
      '--strictPort'
    ],
    { cwd: WEB_DIR, detached: true, stdio: 'inherit' }
  )
  await waitUntil(
    async () => (await fetch(`${ORIGIN}/sw.js`)).ok,
    'o Worker subir'
  )
})

test.afterAll(stopServer)

test('o Worker redireciona /offline.html, e é com isso que o service worker lida', async ({
  request
}) => {
  const direct = await request.get(`${ORIGIN}/offline.html`, {
    maxRedirects: 0
  })
  expect(direct.status()).toBe(307)
  expect(direct.headers().location).toBe('/offline')

  const followed = await request.get(`${ORIGIN}/offline.html`)
  expect(followed.status()).toBe(200)
  expect(await followed.text()).toContain('Sem conexão')
})

test('WEB-269: sem rede, a aba controlada pelo service worker abre a página offline', async ({
  page
}) => {
  // `/offline` é arquivo estático: não passa pelo código do Worker.
  await page.goto(`${ORIGIN}/offline`)
  // Em texto: o tsconfig da suíte não carrega os tipos de DOM.
  await page.evaluate(`(async () => {
    await navigator.serviceWorker.register('/sw.js')
    await navigator.serviceWorker.ready
    if (!navigator.serviceWorker.controller) {
      await new Promise((resolve) =>
        navigator.serviceWorker.addEventListener('controllerchange', resolve, {
          once: true
        })
      )
    }
  })()`)

  // Rede fora do ar de verdade: `setOffline` não vale para o `fetch` de
  // dentro do service worker.
  stopServer()
  await waitUntil(
    () =>
      fetch(`${ORIGIN}/sw.js`).then(
        () => false,
        () => true
      ),
    'o Worker cair',
    15_000
  )

  // Antes da correção esta navegação morria em `net::ERR_FAILED`.
  await page.goto(`${ORIGIN}/dashboard`)
  await expect(page).toHaveTitle('Sem conexão — Onside')
})
