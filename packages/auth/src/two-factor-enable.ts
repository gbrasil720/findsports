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
 * O `before` reconhece a ativação pela mesma condição do plugin (sessão
 * aberta e `two_factor` ainda não verificado): o `verify-totp` do login não
 * tem sessão, e não pode derrubar os outros aparelhos a cada entrada.
 */
export const revokeOtherSessionsOnTwoFactorEnable = () =>
  ({
    id: 'two-factor-enable-revokes-sessions',
    hooks: {
      before: [
        {
          matcher: (ctx) => ctx.path === '/two-factor/verify-totp',
          handler: createAuthMiddleware(async (ctx) => {
            const session = await getSessionFromCtx(ctx)
            if (!session) return
            const row = await ctx.context.adapter.findOne<{
              verified: boolean | null
            }>({
              model: 'twoFactor',
              where: [{ field: 'userId', value: session.user.id }]
            })
            if (!row || row.verified === true) return
            return {
              context: { twoFactorEnablingUserId: session.user.id }
            }
          })
        }
      ],
      after: [
        {
          matcher: (ctx) => ctx.path === '/two-factor/verify-totp',
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
