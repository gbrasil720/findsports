import { setCookie } from '@tanstack/react-start/server'
import type { BetterAuthPlugin } from 'better-auth'
import { createAuthMiddleware } from 'better-auth/api'
import { parseSetCookieHeader, toCookieOptions } from 'better-auth/cookies'

/**
 * Repassa ao TanStack Start os cookies que o better-auth grava em chamadas por
 * `auth.api` — o roteador HTTP dele já devolve o `Set-Cookie` na própria
 * resposta, e por isso fica de fora.
 *
 * É o `tanstackStartCookies` do better-auth com uma diferença: `setCookie` vem
 * por import estático. O original faz `import()` dinâmico, e no bundle do
 * Worker esse import resolve para o chunk de entrada, que não exporta
 * `setCookie`. A chamada estourava dentro de um `catch {}` e nenhum cookie
 * saía: a ativação por convite não logava (WEB-247) e o cache de sessão em
 * cookie nunca era regravado pelo SSR, pelo tRPC nem pelas server functions.
 * No `vite dev` o plugin original funcionava, então o E2E não via nada.
 *
 * Tem de ser o último plugin: hook `after` que grave cookie depois dele fica
 * sem repasse.
 */
export const startCookies = () =>
  ({
    id: 'start-cookies',
    hooks: {
      after: [
        {
          matcher: () => true,
          handler: createAuthMiddleware(async (ctx) => {
            if ('_flag' in ctx && ctx._flag === 'router') return
            const headers = ctx.context.responseHeaders
            const setCookies =
              headers instanceof Headers ? headers.get('set-cookie') : null
            if (!setCookies) return
            for (const [name, cookie] of parseSetCookieHeader(setCookies)) {
              if (!name) continue
              try {
                setCookie(name, cookie.value, toCookieOptions(cookie))
              } catch (error) {
                // Fora de uma requisição do Start (teste, script) não há
                // resposta onde gravar. Qualquer outra falha vai para o log:
                // foi um `catch` mudo que escondeu o WEB-247.
                const message = error instanceof Error ? error.message : ''
                if (!message.includes('No StartEvent found')) {
                  console.error(
                    JSON.stringify({ event: 'start_cookie_failed', message })
                  )
                }
              }
            }
          })
        }
      ]
    }
  }) satisfies BetterAuthPlugin
