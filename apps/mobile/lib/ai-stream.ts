import { type Dubla, dublaConfirm, dublaConverse } from './ai-dubla'
import type {
  ChatEvent,
  ConfirmInput,
  ConfirmResult,
  ConverseInput
} from './ai-events'
import { trpcClient } from './trpc'

/*
 * De onde vêm os eventos da busca com IA: `ai.converse` (tRPC em fluxo,
 * `httpBatchStreamLink`) e `ai.confirm`, ou o dublê em desenvolvimento.
 *
 * TROCAR: quando `ai.converse` e `ai.confirm` estiverem no `AppRouter`, apague
 * o `Server` abaixo e chame `trpcClient.ai.converse.mutate` direto.
 */
type Server = {
  ai: {
    converse: {
      mutate: (
        input: ConverseInput,
        options: { signal: AbortSignal }
      ) => Promise<AsyncIterable<ChatEvent>>
    }
    confirm: { mutate: (input: ConfirmInput) => Promise<ConfirmResult> }
  }
}
const server = trpcClient as unknown as Server

export async function* converse(
  input: ConverseInput,
  signal: AbortSignal,
  dubla: { mode: Dubla; hold?: boolean } | null
): AsyncGenerator<ChatEvent> {
  if (__DEV__ && dubla) {
    yield* dublaConverse(input, signal, dubla)
    return
  }
  yield* await server.ai.converse.mutate(input, { signal })
}

export const confirm = (input: ConfirmInput, dubla: boolean) =>
  __DEV__ && dubla ? dublaConfirm(input) : server.ai.confirm.mutate(input)
