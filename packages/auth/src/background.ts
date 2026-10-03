import { waitUntil } from '@vercel/functions'

type Handler = (promise: Promise<unknown>) => void

/**
 * Para onde o better-auth manda o trabalho que fica para depois da resposta
 * (`advanced.backgroundTasks`). O padrão é o `waitUntil` da Vercel, que segue
 * servindo produção até o corte; fora dela (dev, testes) ele não acha contexto
 * e a promessa só corre. O Worker troca pelo `waitUntil` de
 * `cloudflare:workers` em `apps/web/src/worker.ts` (WEB-199). O import da
 * Vercel sai no WEB-206.
 */
let current: Handler = waitUntil

export function setBackgroundTaskHandler(handler: Handler) {
  current = handler
}

export const runInBackground: Handler = (promise) => current(promise)
