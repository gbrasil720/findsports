import { and, db, eq, isNull, or } from '@findsports_oficial/db'
import { appWaitlist } from '@findsports_oficial/db/schema/app-waitlist'
import { protectedProcedure, router } from '../index'

/*
 * "Me avise quando o app chegar" no web do torcedor (dono, 05/11/2026). Só
 * com sessão: o e-mail é o da conta, o cliente não escolhe. Entrar e sair
 * são idempotentes. Nenhum e-mail sai daqui; o envio do lançamento é outra
 * rotina e pula quem tem `unsubscribed_at`.
 */

/** A linha da pessoa: pelo e-mail de hoje ou pela conta (e-mail trocado). */
function mine(userId: string, email: string) {
  return or(eq(appWaitlist.email, email), eq(appWaitlist.userId, userId))
}

export const appWaitlistRouter = router({
  status: protectedProcedure.query(async ({ ctx }) => {
    const { id } = ctx.session.user
    const email = ctx.session.user.email.toLowerCase()
    const [row] = await db
      .select({ email: appWaitlist.email })
      .from(appWaitlist)
      .where(and(mine(id, email), isNull(appWaitlist.unsubscribedAt)))
      .limit(1)
    return { email: row?.email ?? email, joined: Boolean(row) }
  }),

  /** Entra (ou volta) na lista com o e-mail da sessão. */
  join: protectedProcedure.mutation(async ({ ctx }) => {
    const { id } = ctx.session.user
    const email = ctx.session.user.email.toLowerCase()
    await db
      .insert(appWaitlist)
      .values({ email, userId: id, source: 'web' })
      .onConflictDoUpdate({
        target: appWaitlist.email,
        // A linha da landing (só e-mail) passa a ser desta conta; quem tinha
        // saído volta. `source` e `created_at` ficam os da primeira entrada.
        set: { userId: id, unsubscribedAt: null }
      })
    return { email, joined: true }
  }),

  /** "Não quero mais": marca a saída, não apaga (ver o schema). */
  leave: protectedProcedure.mutation(async ({ ctx }) => {
    const { id } = ctx.session.user
    const email = ctx.session.user.email.toLowerCase()
    await db
      .update(appWaitlist)
      .set({ unsubscribedAt: new Date() })
      .where(and(mine(id, email), isNull(appWaitlist.unsubscribedAt)))
    return { email, joined: false }
  })
})
