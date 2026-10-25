import {
  idempotentMutationKeys,
  retryDelay,
  retryTransient
} from '@findsports_oficial/api/lib/transient-error'
import type { AppRouter } from '@findsports_oficial/api/routers/index'
import { onlineManager, QueryCache, QueryClient } from '@tanstack/react-query'

import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'
import {
  createTRPCClient,
  httpBatchLink,
  httpLink,
  splitLink
} from '@trpc/client'
import { createTRPCOptionsProxy } from '@trpc/tanstack-react-query'
import { toast } from 'sonner'

import { Loader } from './components/loader'
import { NotFoundPage } from './components/not-found/not-found-page'
import { RouteErrorPage } from './components/route-error-page'
import { houdiniRewriteInput, houdiniRewriteOutput } from './lib/houdini-host'
import { getUserFacingError, shouldRetryQuery } from './lib/user-facing-error'
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
    defaultOptions: {
      // Só a falha passageira tenta de novo, com espera crescente (WEB-460).
      queries: { staleTime: 60 * 1000, retry: shouldRetryQuery, retryDelay }
    }
  })

  // Mutation só repete sozinha quando mandar duas vezes dá no mesmo
  // (WEB-460); as outras voltam ao botão "Tentar de novo".
  for (const mutationKey of idempotentMutationKeys())
    queryClient.setMutationDefaults(mutationKey, {
      retry: retryTransient,
      retryDelay
    })

  // A rede voltou (WEB-460): a tela à vista é relida inteira, não só o que
  // passou do `staleTime`; o que ficou em erro enquanto caía volta sozinho.
  if (typeof window !== 'undefined')
    onlineManager.subscribe((online) => {
      if (online) void queryClient.invalidateQueries()
    })

  const linkOptions = {
    url: '/api/trpc',
    fetch(url: RequestInfo | URL, options?: RequestInit) {
      return fetch(url, {
        ...options,
        credentials: 'include'
      })
    }
  }
  const trpcClient = createTRPCClient<AppRouter>({
    links: [
      // O lote só responde quando a última chamada dele termina. As consultas
      // do cupom, do saldo e das faturas (WEB-443) vão ao Stripe; no mesmo
      // lote, seguravam a assinatura de `/admin/billing` e de `/plan` em
      // "Carregando…" até o Stripe responder (WEB-348) — o saldo, num refetch
      // junto com a assinatura. Cada uma sai em requisição própria.
      splitLink({
        condition: (op) =>
          op.path === 'pub.getFounderCouponAvailable' ||
          op.path === 'pub.getMyBillingBalance' ||
          op.path === 'pub.getMyInvoices',
        true: httpLink(linkOptions),
        false: httpBatchLink(linkOptions)
      })
    ]
  })

  const trpc = createTRPCOptionsProxy({
    client: trpcClient,
    queryClient
  })

  const router = createTanStackRouter({
    routeTree,
    // WEB-383: `houdini.onside.sh/x` é a rota `/houdini/x` (ver houdini-host).
    rewrite: {
      input: ({ url }) => houdiniRewriteInput(url),
      output: ({ url }) => houdiniRewriteOutput(url)
    },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    context: {
      trpc,
      queryClient,
      lastSessionCheck: {},
      syncSession(userId: string | null) {
        if (cachedUserId === userId) return
        // clear also cancels pending queries so an old response cannot refill
        // the next user's cache. State belongs to this router, including SSR.
        queryClient.clear()
        cachedUserId = userId
      }
    },
    // O cache desidratado pertence à conta que o servidor viu. Sem levar essa
    // conta junto, o cliente começa em `null` — a hidratação não roda
    // `beforeLoad` — e a primeira navegação limpava o cache inteiro,
    // remontando a página e apagando o que estava digitado (WEB-140).
    dehydrate: () => ({ cachedUserId }),
    hydrate: (dehydrated) => {
      cachedUserId = dehydrated.cachedUserId
    },
    defaultPendingComponent: () => <Loader />,
    defaultNotFoundComponent: NotFoundPage,
    defaultErrorComponent: RouteErrorPage,
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
