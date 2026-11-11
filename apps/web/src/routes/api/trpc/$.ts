import { createContext } from '@findsports_oficial/api/context'
import { appRouter } from '@findsports_oficial/api/routers/index'
import { createFileRoute } from '@tanstack/react-router'
import { fetchRequestHandler } from '@trpc/server/adapters/fetch'

function handler({ request }: { request: Request }) {
  return fetchRequestHandler({
    req: request,
    router: appRouter,
    createContext,
    endpoint: '/api/trpc',
    // A compressão da borda pode juntar os eventos do chat num pedaço só.
    responseMeta: ({ paths }) =>
      paths?.includes('ai.converse')
        ? { headers: new Headers({ 'cache-control': 'no-transform' }) }
        : {}
  })
}

export const Route = createFileRoute('/api/trpc/$')({
  server: {
    handlers: {
      GET: handler,
      POST: handler
    }
  }
})
