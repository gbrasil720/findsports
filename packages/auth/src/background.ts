type Handler = (promise: Promise<unknown>) => void

/**
 * Para onde o better-auth manda o trabalho que fica para depois da resposta
 * (`advanced.backgroundTasks`). O Worker registra o `waitUntil` de
 * `cloudflare:workers` em `apps/web/src/worker.ts` (WEB-199), que segura a
 * invocação até a promessa terminar. Fora dele (dev, testes) o processo fica
 * vivo, então a promessa só corre — `cloudflare:workers` nem existe em Node.
 */
let current: Handler = () => {}

export function setBackgroundTaskHandler(handler: Handler) {
  current = handler
}

export const runInBackground: Handler = (promise) => current(promise)
