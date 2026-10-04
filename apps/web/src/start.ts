import {
  createCsrfMiddleware,
  createMiddleware,
  createStart
} from '@tanstack/react-start'
import { getSessionCookie } from 'better-auth/cookies'

import { requiresAuthentication } from './utils/auth-guards'

/**
 * WEB-151: sem `Cache-Control` um cache no caminho pode guardar o HTML, e o de
 * quem está logado leva nome, e-mail e o cache de queries hidratado. Resposta a
 * pedido com cookie de sessão, ou a rota protegida (o 307 para `/login`),
 * não pode ser guardada por ninguém. Visitante sem cookie numa página pública
 * segue como antes; rota que já escolheu o próprio cache (sitemap) também.
 */
export function applyPrivateCache(request: Request, headers: Headers) {
  if (headers.has('Cache-Control')) return
  if (
    getSessionCookie(request) ||
    requiresAuthentication(new URL(request.url).pathname)
  ) {
    headers.set('Cache-Control', 'private, no-store')
  }
}

export const startInstance = createStart(() => ({
  requestMiddleware: [
    // O padrão do Start quando não há `start.ts`; declará-lo aqui o mantém.
    createCsrfMiddleware({ filter: (ctx) => ctx.handlerType === 'serverFn' }),
    // Na `Response` final: `setResponseHeader` não chega aos redirects, que o
    // h3 devolve sem mesclar os headers do evento.
    createMiddleware().server(async ({ next, request }) => {
      const result = await next()
      applyPrivateCache(request, result.response.headers)
      return result
    })
  ]
}))
