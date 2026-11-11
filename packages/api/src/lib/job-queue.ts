import type { JobName } from './jobs'

/*
 * Fila das rotinas longas (WEB-433). O "Rodar agora" do Houdini não pode
 * esperar a rotina na requisição (5 a 6 min nos jogos da semana), e o
 * `waitUntil` só segura 30 s depois da resposta. Então ele põe a rotina na
 * fila do Cloudflare Queues (`JOBS` no wrangler.jsonc), e o `queue()` do
 * `worker.ts` a roda com até 15 min. Sem fila (vite dev em Node, testes), a
 * rotina roda na própria requisição, como antes.
 *
 * Módulo sem `@findsports_oficial/env`, pelo mesmo motivo do `binding-slot`
 * da IA: o `worker.ts` importa isto no topo.
 */

export type JobMessage = { job: JobName }

export type JobQueue = { send: (message: JobMessage) => Promise<unknown> }

/** As rotinas que passam do tempo de uma requisição. */
export const QUEUED_JOBS: readonly JobName[] = ['weekly_games']

let queue: JobQueue | null = null

export function setJobQueue(next: JobQueue | null) {
  queue = next
}

/** Põe na fila; falso quando não há fila e a rotina tem de rodar aqui. */
export async function enqueueJob(job: JobName): Promise<boolean> {
  if (!queue || !QUEUED_JOBS.includes(job)) return false
  await queue.send({ job })
  return true
}
