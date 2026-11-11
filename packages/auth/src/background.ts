type Handler = (promise: Promise<unknown>) => void

/**
 * Para onde vai o trabalho que fica para depois da resposta: o do
 * better-auth (`advanced.backgroundTasks`) e o do `ai.converse`. O Worker registra o `waitUntil` de
 * `cloudflare:workers` em `apps/web/src/worker.ts` (WEB-199), que segura a
 * invocação até a promessa terminar. Fora dele (dev, testes) o processo fica
 * vivo, então a promessa só corre — `cloudflare:workers` nem existe em Node.
 */
let current: Handler = () => {}

export function setBackgroundTaskHandler(handler: Handler) {
  current = handler
}

export const runInBackground: Handler = (promise) => current(promise)
