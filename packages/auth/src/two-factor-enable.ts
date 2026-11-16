import type { BetterAuthPlugin } from 'better-auth'
import { createAuthMiddleware, getSessionFromCtx } from 'better-auth/api'

type EnablingContext = { twoFactorEnablingUserId?: string }

/**
 * Ligar o 2FA encerra as outras sessões da conta.
 *
 * Os portões de admin (`adminProcedure`, `admin-guard.ts`, `houdini-gate.ts`)
 * leem `user.twoFactorEnabled`, que é da conta e não da sessão. O
 * `/two-factor/verify-totp` da ativação troca só a sessão que ligou; sem isto,
 * uma sessão aberta antes só com a senha (senha vazada, aparelho perdido)
 * passava a ter admin sem nunca ter mostrado o segundo fator.
 *
 * Depois daqui toda sessão nova da conta passa pelo login com TOTP, então a
 * flag da conta volta a valer como garantia da sessão. Não há marca por
 * sessão (seria coluna nova e três portões mudando).
 *
 * As duas rotas que ligam o 2FA no better-auth 1.6 são o `verify-totp` e o
 * `verify-otp` (este só com `otp.sendOTP`, hoje desligado). Ambas só ligam com
 * sessão aberta e a flag da conta ainda falsa, e só então criam sessão nova;
 * o `before` confere isso no banco (o cookie cache pode estar velho). No
 * login não há sessão, e entrar não derruba os outros aparelhos.
 */
const ENABLING_PATHS = new Set([
  '/two-factor/verify-totp',
  '/two-factor/verify-otp'
])

export const matchesTwoFactorEnable = (ctx: { path?: string }) =>
  ENABLING_PATHS.has(ctx.path ?? '')

export const revokeOtherSessionsOnTwoFactorEnable = () =>
  ({
    id: 'two-factor-enable-revokes-sessions',
    hooks: {
      before: [
        {
          matcher: matchesTwoFactorEnable,
          handler: createAuthMiddleware(async (ctx) => {
            const session = await getSessionFromCtx(ctx)
            if (!session) return
            const account = (await ctx.context.internalAdapter.findUserById(
              session.user.id
            )) as { twoFactorEnabled?: boolean | null } | null
            if (!account || account.twoFactorEnabled === true) return
            return {
              context: { twoFactorEnablingUserId: session.user.id }
            }
          })
        }
      ],
      after: [
        {
          matcher: matchesTwoFactorEnable,
          handler: createAuthMiddleware(async (ctx) => {
            const userId = (ctx as EnablingContext).twoFactorEnablingUserId
            if (!userId) return
            if (ctx.context.returned instanceof Error) return
            const kept = ctx.context.newSession?.session.token
            // Sem sessão nova o plugin não ligou nada (conta já com a flag):
            // não há o que manter, e nada é revogado.
            if (!kept) return
            const sessions =
              await ctx.context.internalAdapter.listSessions(userId)
            for (const other of sessions) {
              if (other.token !== kept) {
                await ctx.context.internalAdapter.deleteSession(other.token)
              }
            }
          })
        }
      ]
    }
  }) satisfies BetterAuthPlugin
