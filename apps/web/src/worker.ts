/**
 * Entrada do Worker `onside-web` (WEB-199). Chama-se `worker.ts`, e não
 * `server.ts`, porque o TanStack Start usaria `src/server.ts` também no
 * `vite dev` em Node, onde `cloudflare:workers` não existe.
 */
import { waitUntil } from 'cloudflare:workers'
import { reconcileBarPlans } from '@findsports_oficial/api/lib/bar-plan-sync'
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
  // WEB-203: retenção diária de analytics pelo Cron Trigger, sem rota HTTP
  // nem segredo. A agenda está em `triggers.crons` no wrangler.jsonc. A
  // promessa é devolvida, e não posta em `waitUntil`, para que uma falha
  // marque a invocação como falha no painel.
  //
  // WEB-129: o mesmo cron reaplica o plano vigente em `bar.plan`, que é como
  // um trial vencido sai da camada do plano na busca, e o bar de teste do
  // cadastro vencido sem contratação sai do ar (WEB-357). O `finally` garante
  // que uma falha ali não pule a retenção, e a falha ainda marca a invocação.
  async scheduled(_controller, env) {
    await runWithDb(env.HYPERDRIVE.connectionString, async () => {
      try {
        await reconcileBarPlans()
      } finally {
        await runScheduledAnalyticsRetention()
      }
    })
  }
} satisfies ExportedHandler<Env>
