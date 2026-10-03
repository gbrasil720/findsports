/**
 * Entrada do Worker `onside-web` (WEB-199). Chama-se `worker.ts`, e não
 * `server.ts`, porque o TanStack Start usaria `src/server.ts` também no
 * `vite dev` em Node, onde `cloudflare:workers` não existe.
 */
import { waitUntil } from 'cloudflare:workers'
import { runScheduledAnalyticsRetention } from '@findsports_oficial/api/lib/commercial-analytics/retention'
import { setBackgroundTaskHandler } from '@findsports_oficial/auth/background'
import { runWithDb } from '@findsports_oficial/db'
import handler from '@tanstack/react-start/server-entry'

import { withHsts } from './lib/hsts'

setBackgroundTaskHandler(waitUntil)

export default {
  async fetch(request, env) {
    // WEB-201: banco por requisição, sobre o Hyperdrive.
    const response = await runWithDb(env.HYPERDRIVE.connectionString, () =>
      handler.fetch(request)
    )
    return withHsts(response)
  },
  // WEB-203: retenção diária de analytics pelo Cron Trigger, sem HTTP nem
  // CRON_SECRET. A agenda está em `triggers.crons` no wrangler.jsonc. A
  // promessa é devolvida, e não posta em `waitUntil`, para que uma falha
  // marque a invocação como falha no painel.
  async scheduled(_controller, env) {
    await runWithDb(
      env.HYPERDRIVE.connectionString,
      runScheduledAnalyticsRetention
    )
  }
} satisfies ExportedHandler<Env>
