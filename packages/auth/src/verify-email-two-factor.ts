import type { BetterAuthPlugin } from 'better-auth'
import { createAuthMiddleware, getSessionFromCtx } from 'better-auth/api'

type VerifyEmailContext = { sessionBeforeVerifyEmail?: string | null }

const isVerifyEmail = (ctx: { path?: string }) =>
  ctx.path?.startsWith('/verify-email') ?? false

/**
 * O link de confirmação de e-mail entra na conta
 * (`autoSignInAfterVerification`) sem pedir o segundo fator. Com o 2FA ligado
 * ele só confirma o e-mail: a sessão que o better-auth acabou de criar é
 * apagada e os cookies dela saem da resposta. O redirecionamento segue, sem
 * sessão; a pessoa entra pelo login, que pede o TOTP.
 *
 * Fica antes do `expo()`: sem `Set-Cookie` de sessão, ele não põe
 * `?cookie=` na volta ao app, e o `/verified` do app já trata a falta de
 * sessão mandando ao login. Sessão que já existia (a mesma conta logada
 * abrindo o link) não é tocada.
 */
export const verifyEmailRespectsTwoFactor = () =>
  ({
    id: 'verify-email-respects-two-factor',
    hooks: {
      before: [
        {
          matcher: isVerifyEmail,
          handler: createAuthMiddleware(async (ctx) => ({
            context: {
              sessionBeforeVerifyEmail:
                (await getSessionFromCtx(ctx))?.session.id ?? null
            }
          }))
        }
      ],
      after: [
        {
          matcher: isVerifyEmail,
          handler: createAuthMiddleware(async (ctx) => {
            const created = ctx.context.newSession
            if (!created) return
            const before = (ctx as VerifyEmailContext).sessionBeforeVerifyEmail
            if (created.session.id === before) return
            const account = (await ctx.context.internalAdapter.findUserById(
              created.user.id
            )) as { twoFactorEnabled?: boolean | null } | null
            if (account?.twoFactorEnabled !== true) return

            await ctx.context.internalAdapter.deleteSession(
              created.session.token
            )
            const headers = ctx.context.responseHeaders
            if (!headers) return
            const { sessionToken, sessionData, dontRememberToken } =
              ctx.context.authCookies
            // `session_data` pode sair em pedaços (`.0`, `.1`…).
            const names = [
              sessionToken.name,
              sessionData.name,
              dontRememberToken.name
            ]
            const kept = headers.getSetCookie().filter((cookie) => {
              const name = cookie.slice(0, cookie.indexOf('='))
              return !names.some(
                (session) => name === session || name.startsWith(`${session}.`)
              )
            })
            headers.delete('set-cookie')
            for (const cookie of kept) headers.append('set-cookie', cookie)
          })
        }
      ]
    }
  }) satisfies BetterAuthPlugin
