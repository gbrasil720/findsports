import { and, db, eq, sql } from '@findsports_oficial/db'
import { utcNowSql } from '@findsports_oficial/db/event-window-sql'
import { session } from '@findsports_oficial/db/schema/auth'
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
      /*
       * Token de outra conta só muda de dono se a sessão dela já venceu: quem
       * soubesse o token de outra pessoa o prenderia à própria conta (o
       * aparelho dela deixaria de receber os seus avisos e passaria a receber
       * os de quem o tomou). O `ON CONFLICT` trava a linha antes do `WHERE`,
       * então duas chamadas ao mesmo tempo não escapam. Sair da conta apaga a
       * linha (cascata), e o login seguinte no aparelho cai no `INSERT`.
       */
      const kept = await db
        .insert(pushToken)
        .values({ token: input.token, ...owner })
        .onConflictDoUpdate({
          target: pushToken.token,
          set: owner,
          setWhere: sql`${pushToken.userId} = ${owner.userId} or not exists (
            select 1 from ${session}
            where ${session.id} = ${pushToken.sessionId}
              and ${session.expiresAt} > ${utcNowSql()}
          )`
        })
        .returning({ token: pushToken.token })
      if (kept.length === 0) {
        // O app não mostra nada: responder com erro só ensinaria a quem tenta.
        console.warn(
          JSON.stringify({
            evt: 'push_token_rebind_refused',
            userId: owner.userId,
            token: input.token.slice(0, 22)
          })
        )
      }
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
