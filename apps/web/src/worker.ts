/**
 * Entrada do Worker `onside-web` (WEB-199). Chama-se `worker.ts`, e não
 * `server.ts`, porque o TanStack Start usaria `src/server.ts` também no
 * `vite dev` em Node, onde `cloudflare:workers` não existe.
 */
import { waitUntil } from 'cloudflare:workers'
import {
  type AiBinding,
  setAiBinding
} from '@findsports_oficial/api/lib/ai/binding-slot'
import { setDeployVersion } from '@findsports_oficial/api/lib/deploy-version'
import {
  type JobMessage,
  setJobQueue
} from '@findsports_oficial/api/lib/job-queue'
import { runJob, runScheduledJobs } from '@findsports_oficial/api/lib/jobs'
import { setBackgroundTaskHandler } from '@findsports_oficial/auth/background'
import { runWithDb } from '@findsports_oficial/db'
import handler from '@tanstack/react-start/server-entry'

import { withHsts } from './lib/hsts'

setBackgroundTaskHandler(waitUntil)

export default {
  async fetch(request, env) {
    setDeployVersion(env.CF_VERSION_METADATA)
    // WEB-433: o "Rodar agora" das rotinas longas vai para a fila.
    setJobQueue(env.JOBS)
    // WEB-424: o binding do Workers AI, para a IA do app.
    setAiBinding(env.AI as unknown as AiBinding)
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
  // cadastro vencido sem contratação sai do ar (WEB-357). O `finally` de
  // `runScheduledJobs` garante que uma falha ali não pule a retenção, e a
  // falha ainda marca a invocação.
  //
  // WEB-389: cada rotina deixa uma linha em `job_run`, que o Bastidores do
  // Houdini mostra.
  //
  // WEB-441: por último, os avisos da semana por e-mail aos bares, que só
  // enviam às segundas.
  //
  // WEB-433: os jogos da semana chamam a IA no cron: o binding entra aqui também.
  async scheduled(_controller, env) {
    setAiBinding(env.AI as unknown as AiBinding)
    await runWithDb(env.HYPERDRIVE.connectionString, runScheduledJobs)
  },
  // WEB-433: rotina longa pedida pelo Houdini (`lib/job-queue.ts`), com o
  // tempo de um consumidor de fila. Uma mensagem por vez e sem nova tentativa
  // (`max_retries: 0`): repetir gastaria o teto de novo, e a falha já fica em
  // `job_run`, que o Bastidores mostra.
  async queue(batch, env) {
    setAiBinding(env.AI as unknown as AiBinding)
    for (const message of batch.messages) {
      try {
        await runWithDb(env.HYPERDRIVE.connectionString, () =>
          runJob(message.body.job, 'houdini')
        )
      } catch {
        // Registrada em `job_run` por `recordJobRun`.
      }
      message.ack()
    }
  }
} satisfies ExportedHandler<Env, JobMessage>
