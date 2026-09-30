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

const TOKEN_RETURNING_PATHS = new Set([
  '/get-session',
  '/list-sessions',
  '/sign-in/email',
  '/sign-up/email',
  '/change-password',
  '/two-factor/verify-totp',
  '/two-factor/verify-otp',
  '/two-factor/verify-backup-code',
  '/admin/list-user-sessions',
  '/admin/impersonate-user',
  '/admin/stop-impersonating'
])

/**
 * WEB-150: o token da sessão é o valor do cookie `httpOnly`. O better-auth o
 * devolve em toda rota que cria, lê ou lista sessão — `get-session`,
 * `list-sessions` (todos os aparelhos da conta), o login e as rotas de admin —,
 * o que entregava a um XSS o que o `httpOnly` existe para esconder. Quem
 * precisa da sessão nova a recebe pelo `Set-Cookie`.
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
          matcher: (ctx) => TOKEN_RETURNING_PATHS.has(ctx.path ?? ''),
          handler: createAuthMiddleware(async (ctx) => {
            // Formatos: lista de sessões, `{ sessions }`, `{ session, user }`
            // ou `{ token, user }`. `null` e erro (`APIError`) passam intactos.
            const returned = ctx.context.returned as
              | WithToken[]
              | (WithToken & { session?: WithToken; sessions?: WithToken[] })
              | null
            if (Array.isArray(returned)) {
              return ctx.json(returned.map(withoutToken))
            }
            if (!returned || returned instanceof Error) return
            const body = withoutToken(returned)
            if (body.session) body.session = withoutToken(body.session)
            if (body.sessions) body.sessions = body.sessions.map(withoutToken)
            return ctx.json(body)
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
