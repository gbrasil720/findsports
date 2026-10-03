/**
 * Entrada do Worker `onside-web` (WEB-199). Chama-se `worker.ts`, e não
 * `server.ts`, porque o TanStack Start usaria `src/server.ts` também no
 * `vite dev` em Node, onde `cloudflare:workers` não existe.
 */
import { waitUntil } from 'cloudflare:workers'
import { setBackgroundTaskHandler } from '@findsports_oficial/auth/background'
import { runWithDb } from '@findsports_oficial/db'
import handler from '@tanstack/react-start/server-entry'

setBackgroundTaskHandler(waitUntil)

export default {
  fetch(request, env) {
    // WEB-201: banco por requisição, sobre o Hyperdrive.
    return runWithDb(env.HYPERDRIVE.connectionString, () =>
      handler.fetch(request)
    )
  }
} satisfies ExportedHandler<Env>
