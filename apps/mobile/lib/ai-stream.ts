import type { Dubla } from './ai-dubla'
import type { ChatEvent, ConfirmInput, ConverseInput } from './ai-events'
import { queryClient } from './query-client'
import { trpcClient } from './trpc'

/*
 * De onde vêm os eventos da busca com IA: `ai.converse` (tRPC em fluxo,
 * `httpBatchStreamLink`) e `ai.confirm`, ou o dublê em desenvolvimento.
 * O dublê entra por `require` dentro do `__DEV__`: assim ele (e o pior caso
 * de `ai-chat-demo`) sai do bundle de produção.
 */
type DublaModule = typeof import('./ai-dubla')
const server = trpcClient

export async function* converse(
  input: ConverseInput,
  signal: AbortSignal,
  dubla: { mode: Dubla; hold?: boolean } | null
): AsyncGenerator<ChatEvent> {
  if (__DEV__ && dubla) {
    const { dublaConverse }: DublaModule = require('./ai-dubla')
    yield* dublaConverse(input, signal, dubla)
    return
  }
  yield* await server.ai.converse.mutate(input, { signal })
}

export const confirm = (input: ConfirmInput, dubla: boolean) =>
  __DEV__ && dubla
    ? (require('./ai-dubla') as DublaModule).dublaConfirm(input)
    : server.ai.confirm.mutate(input).then((result) => {
        // O "Confirmar" marca presença, chama amigo ou lembra, fora do
        // `useMutation`: o cache vence como numa mutation (`query-client.ts`).
        queryClient.invalidateQueries({ refetchType: 'none' })
        return result
      })
