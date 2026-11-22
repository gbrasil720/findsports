import {
  createCsrfMiddleware,
  createMiddleware,
  createStart
} from '@tanstack/react-start'
import { getSessionCookie } from 'better-auth/cookies'

import { contentSecurityPolicy, createNonce } from './lib/csp'
import { HOUDINI_PREFIX, isHoudiniHost } from './lib/houdini-host'
import { SITE_URL } from './lib/site'
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

/**
 * WEB-383: nada do Houdini vai para busca nem para cache — nem o 404 da
 * Cortina, que é o que um robô vê.
 */
export function applyHoudiniHeaders(request: Request, headers: Headers) {
  const url = new URL(request.url)
  if (
    !isHoudiniHost(url.hostname) &&
    url.pathname !== HOUDINI_PREFIX &&
    !url.pathname.startsWith(`${HOUDINI_PREFIX}/`)
  ) {
    return
  }
  headers.set('X-Robots-Tag', 'noindex, nofollow')
  headers.set('Cache-Control', 'private, no-store')
}

const CANONICAL_HOST = new URL(SITE_URL).hostname

/**
 * SEO: só `www.onside.sh` entra no índice. O preview por PR é uma cópia no
 * `workers.dev` e o Houdini responde no mesmo Worker: sem isto, são a home
 * duplicada com `index, follow`.
 */
export function applyHostIndexing(request: Request, headers: Headers) {
  if (new URL(request.url).hostname === CANONICAL_HOST) return
  headers.set('X-Robots-Tag', 'noindex, nofollow')
}

/**
 * CSP com nonce no HTML do SSR (`lib/csp.ts`). O nonce vai no contexto da
 * requisição, de onde o router o lê (`ssr.nonce` em `router.tsx`). No
 * `vite dev` não: ele escreve scripts inline sem nonce (HMR, React Refresh).
 * `TSS_DEV_SERVER`, e não `DEV`: o E2E builda com `NODE_ENV=development`, que
 * liga o `DEV` no build, e precisa da mesma política da produção.
 */
export function applyContentSecurityPolicy(headers: Headers, nonce: string) {
  if (!headers.get('Content-Type')?.includes('text/html')) return
  headers.set(
    'Content-Security-Policy',
    contentSecurityPolicy(
      nonce,
      import.meta.env.VITE_MAP_TILES_URL,
      import.meta.env.VITE_POSTHOG_HOST
    )
  )
}

export const startInstance = createStart(() => ({
  requestMiddleware: [
    // O padrão do Start quando não há `start.ts`; declará-lo aqui o mantém.
    createCsrfMiddleware({ filter: (ctx) => ctx.handlerType === 'serverFn' }),
    // Na `Response` final: `setResponseHeader` não chega aos redirects, que o
    // h3 devolve sem mesclar os headers do evento.
    createMiddleware().server(async ({ next, request }) => {
      const nonce =
        import.meta.env.TSS_DEV_SERVER === 'true' ? undefined : createNonce()
      const result = await next({ context: { nonce } })
      if (nonce) applyContentSecurityPolicy(result.response.headers, nonce)
      applyHostIndexing(request, result.response.headers)
      applyHoudiniHeaders(request, result.response.headers)
      applyPrivateCache(request, result.response.headers)
      return result
    })
  ]
}))
