import { and, db, eq } from '@findsports_oficial/db'
import { pushToken } from '@findsports_oficial/db/schema/push'
import { z } from 'zod'
import { protectedProcedure, router } from '../index'

/*
 * O token de push do aparelho (WEB-416). O app registra a cada abertura com
 * a permissão dada; a linha fica presa à sessão, então sair da conta a apaga
 * no servidor sem o app precisar avisar. Permissão tirada nos ajustes do
 * celular: o app chama `unregister`.
 */
const token = z
  .string()
  .regex(/^Expo(nent)?PushToken\[[^\]]{1,200}\]$/, 'Token de push inválido.')

export const pushRouter = router({
  register: protectedProcedure
    .input(z.object({ token, platform: z.enum(['ios', 'android']) }))
    .mutation(async ({ ctx, input }) => {
      const owner = {
        userId: ctx.session.user.id,
        sessionId: ctx.session.session.id,
        platform: input.platform,
        updatedAt: new Date()
      }
      await db
        .insert(pushToken)
        .values({ token: input.token, ...owner })
        .onConflictDoUpdate({ target: pushToken.token, set: owner })
      return { success: true }
    }),

  unregister: protectedProcedure
    .input(z.object({ token }))
    .mutation(async ({ ctx, input }) => {
      await db
        .delete(pushToken)
        .where(
          and(
            eq(pushToken.token, input.token),
            eq(pushToken.userId, ctx.session.user.id)
          )
        )
      return { success: true }
    })
})
