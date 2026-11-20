import { createContext } from '@findsports_oficial/api/context'
import { appRouter } from '@findsports_oficial/api/routers/index'
import { auth } from '@findsports_oficial/auth'
import { isForeignPost } from '@findsports_oficial/auth/trusted-origins'
import { createFileRoute } from '@tanstack/react-router'
import { fetchRequestHandler } from '@trpc/server/adapters/fetch'

// As mesmas origens do better-auth (`buildTrustedOrigins`), já resolvidas.
const trustedOrigins = Array.isArray(auth.options.trustedOrigins)
  ? auth.options.trustedOrigins
  : []

function handler({ request }: { request: Request }) {
  // CSRF: o SameSite do cookie não basta sozinho (ver `isForeignPost`).
  if (
    isForeignPost(request.method, request.headers.get('origin'), trustedOrigins)
  )
    return new Response('Origem não permitida', { status: 403 })
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
