import type { AppRouter } from '@findsports_oficial/api/routers/index'
import { QueryClient } from '@tanstack/react-query'
import { createTRPCClient, httpBatchLink } from '@trpc/client'
import { createTRPCOptionsProxy } from '@trpc/tanstack-react-query'
import { authClient } from './auth-client'
import { env } from './env'

export const queryClient = new QueryClient()

// Só o TIPO do router atravessa a fronteira (`import type`): nenhum código de
// servidor entra no bundle do app.
const trpcClient = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: `${env.EXPO_PUBLIC_SERVER_URL}/api/trpc`,
      // A sessão do app vive no SecureStore, não em cookie do sistema: o
      // cliente do better-auth devolve o cabeçalho pronto.
      fetch: (url, options) => fetch(url, { ...options, credentials: 'omit' }),
      headers() {
        const cookie = authClient.getCookie()
        return cookie ? { Cookie: cookie } : {}
      }
    })
  ]
})

export const trpc = createTRPCOptionsProxy<AppRouter>({
  client: trpcClient,
  queryClient
})
