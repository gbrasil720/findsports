import { auth } from '@findsports_oficial/auth'
import { createFileRoute } from '@tanstack/react-router'

// Tudo de `/api/auth/*` vai direto ao better-auth: login, cadastro, sessão e
// as rotas do plugin do Stripe (checkout, portal, webhook). Não há portão
// antes dele: o de entrada por convite saiu no WEB-232 e o interruptor da
// cobrança no WEB-233.

export const Route = createFileRoute('/api/auth/$')({
  server: {
    handlers: {
      GET: ({ request }) => auth.handler(request),
      POST: ({ request }) => auth.handler(request)
    }
  }
})
