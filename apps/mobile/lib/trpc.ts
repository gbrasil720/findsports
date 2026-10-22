import type { AppRouter } from '@findsports_oficial/api/routers/index'
import { QueryClient } from '@tanstack/react-query'
import {
  createTRPCClient,
  httpBatchLink,
  httpBatchStreamLink,
  splitLink
} from '@trpc/client'
import { createTRPCOptionsProxy } from '@trpc/tanstack-react-query'
import { fetch as streamFetch } from 'expo/fetch'
import { authClient } from './auth-client'
import { env } from './env'

export const queryClient = new QueryClient()

// Só o TIPO do router atravessa a fronteira (`import type`): nenhum código de
// servidor entra no bundle do app.
const url = `${env.EXPO_PUBLIC_SERVER_URL}/api/trpc`
// A sessão do app vive no SecureStore, não em cookie do sistema: o cliente do
// better-auth devolve o cabeçalho pronto.
const headers = () => {
  const cookie = authClient.getCookie()
  return cookie ? { Cookie: cookie } : {}
}

const trpcClient = createTRPCClient<AppRouter>({
  links: [
    splitLink({
      // O chat da IA (R24) chega em eventos, um a um: o `fetch` do React
      // Native só entrega o corpo no fim, o de `expo/fetch` lê em fluxo.
      condition: (op) => op.path === 'ai.converse',
      true: httpBatchStreamLink({
        url,
        fetch: (input, options) =>
          streamFetch(String(input), { ...options, credentials: 'omit' }),
        headers
      }),
      false: httpBatchLink({
        url,
        fetch: (input, options) =>
          fetch(input, { ...options, credentials: 'omit' }),
        headers
      })
    })
  ]
})

export const trpc = createTRPCOptionsProxy<AppRouter>({
  client: trpcClient,
  queryClient
})
