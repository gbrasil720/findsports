import type { BetterAuthPlugin } from 'better-auth'
import {
  createAuthEndpoint,
  createAuthMiddleware,
  sensitiveSessionMiddleware
} from 'better-auth/api'
import { z } from 'zod'

type WithToken = { token?: unknown }

function withoutToken<T extends WithToken>({ token: _token, ...rest }: T) {
  return rest
}

/**
 * WEB-150: o token da sessão é o valor do cookie `httpOnly`. O better-auth o
 * devolve em `get-session` (sessão atual) e em `list-sessions` (todas as
 * sessões da conta, de todos os aparelhos), o que entregava a um XSS o que o
 * `httpOnly` existe para esconder.
 *
 * O corte é na resposta, não no schema: `returned: false` no campo `token`
 * também o tiraria de `ctx.context.session` quando a sessão vem do cookie
 * cache, e o próprio better-auth usa esse token para regravar o cookie.
 *
 * Sem token no cliente, revogar passa a ser pelo `id`, que não autentica.
 */
export const sessionTokenGuard = () =>
  ({
    id: 'session-token-guard',
    hooks: {
      after: [
        {
          matcher: (ctx) =>
            ctx.path === '/get-session' || ctx.path === '/list-sessions',
          handler: createAuthMiddleware(async (ctx) => {
            // `list-sessions` devolve a lista; `get-session`, `{ session,
            // user }` ou `null`. Erro (`APIError`) passa sem ser tocado.
            const returned = ctx.context.returned as
              | WithToken[]
              | { session?: WithToken }
              | null
            if (Array.isArray(returned)) {
              return ctx.json(returned.map(withoutToken))
            }
            if (returned?.session) {
              return ctx.json({
                ...returned,
                session: withoutToken(returned.session)
              })
            }
          })
        }
      ]
    },
    endpoints: {
      revokeSessionById: createAuthEndpoint(
        '/revoke-session-by-id',
        {
          method: 'POST',
          body: z.object({ id: z.string() }),
          use: [sensitiveSessionMiddleware],
          requireHeaders: true
        },
        async (ctx) => {
          // Mesma semântica do `/revoke-session` nativo: sessão de outra
          // conta não é revogada, e a resposta não diz se ela existe.
          const sessions = await ctx.context.internalAdapter.listSessions(
            ctx.context.session.user.id
          )
          const target = sessions.find((session) => session.id === ctx.body.id)
          if (target) {
            await ctx.context.internalAdapter.deleteSession(target.token)
          }
          return ctx.json({ status: true })
        }
      )
    }
  }) satisfies BetterAuthPlugin
