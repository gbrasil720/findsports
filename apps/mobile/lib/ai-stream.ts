import { type Dubla, dublaConfirm, dublaConverse } from './ai-dubla'
import type { ChatEvent, ConfirmInput, ConverseInput } from './ai-events'
import { trpcClient } from './trpc'

/*
 * De onde vêm os eventos da busca com IA: `ai.converse` (tRPC em fluxo,
 * `httpBatchStreamLink`) e `ai.confirm`, ou o dublê em desenvolvimento.
 */
const server = trpcClient

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
