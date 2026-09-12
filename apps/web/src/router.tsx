import type { AppRouter } from '@findsports_oficial/api/routers/index'
import { QueryCache, QueryClient } from '@tanstack/react-query'

import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'
import { createTRPCClient, httpBatchLink } from '@trpc/client'
import { createTRPCOptionsProxy } from '@trpc/tanstack-react-query'
import { toast } from 'sonner'

import { Loader } from './components/loader'
import { NotFoundPage } from './components/not-found/not-found-page'
import { getUserFacingError } from './lib/user-facing-error'
import { routeTree } from './routeTree.gen'
import { TRPCProvider } from './utils/trpc'

/**
 * Marcação por query para o toast global de erro.
 *
 * `errorToast: false` é para a tela que já desenha o próprio erro no lugar
 * onde o dado faltou. Sem isso a pessoa recebia duas mensagens pelo mesmo
 * problema — a da tela, em português, e a do toast, que repete o texto cru do
 * servidor (às vezes em inglês, vindo do provedor de pagamento).
 */
declare module '@tanstack/react-query' {
  interface Register {
    queryMeta: { errorToast?: boolean }
  }
}

export const getRouter = () => {
  let cachedUserId: string | null = null
  const queryClient = new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        if (query.meta?.errorToast === false) return
        const feedback = getUserFacingError(
          error,
          'Não foi possível carregar este conteúdo.'
        )
        toast.error(
          feedback.message,
          feedback.retryable
            ? {
                action: {
                  label: 'Tentar novamente',
                  onClick: () => query.invalidate()
                }
              }
            : undefined
        )
      }
    }),
    defaultOptions: { queries: { staleTime: 60 * 1000 } }
  })

  const trpcClient = createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: '/api/trpc',
        fetch(url, options) {
          return fetch(url, {
            ...options,
            credentials: 'include'
          })
        }
      })
    ]
  })

  const trpc = createTRPCOptionsProxy({
    client: trpcClient,
    queryClient
  })

  const router = createTanStackRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    context: {
      trpc,
      queryClient,
      syncSession(userId: string | null) {
        if (cachedUserId === userId) return
        // clear also cancels pending queries so an old response cannot refill
        // the next user's cache. State belongs to this router, including SSR.
        queryClient.clear()
        cachedUserId = userId
      }
    },
    defaultPendingComponent: () => <Loader />,
    defaultNotFoundComponent: NotFoundPage,
    Wrap: ({ children }) => (
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        {children}
      </TRPCProvider>
    )
  })

  setupRouterSsrQueryIntegration({
    router,
    queryClient
  })

  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
