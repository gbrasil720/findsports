import { and, asc, db, eq, sql } from '@findsports_oficial/db'
import { recordAdminAction } from '@findsports_oficial/db/admin-action'
import { REVIEW_REASON_MAX } from '@findsports_oficial/db/bar-gallery'
import { bar, barPhoto } from '@findsports_oficial/db/schema/platform'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import { adminProcedure, router } from '../index'

/**
 * Revisão da Onside (WEB-462): toda foto do bar passa por aqui antes de o
 * torcedor ver. Aprovar ou recusar com motivo; cada decisão fica no
 * Grimório, na mesma transação. A tela é `/houdini/revisao`.
 */

const decision = z.discriminatedUnion('approve', [
  z.object({ approve: z.literal(true) }),
  z.object({
    approve: z.literal(false),
    reason: z.string().trim().min(1).max(REVIEW_REASON_MAX)
  })
])

function actor(ctx: { session: { user: { id: string; name: string } } }) {
  return { actorId: ctx.session.user.id, actorName: ctx.session.user.name }
}

const alreadyReviewed = () =>
  new TRPCError({
    code: 'CONFLICT',
    message: 'Isto já foi revisado ou saiu da fila. Recarregue a fila.'
  })

export const adminReviewRouter = router({
  /** A fila, da mais antiga para a mais nova. */
  queue: adminProcedure.query(async () => {
    const photos = await db
      .select({
        id: barPhoto.id,
        url: barPhoto.url,
        category: barPhoto.category,
        caption: barPhoto.caption,
        coverRequested: barPhoto.coverRequested,
        createdAt: barPhoto.createdAt,
        barId: bar.id,
        barName: bar.name
      })
      .from(barPhoto)
      .innerJoin(bar, eq(bar.id, barPhoto.barId))
      .where(eq(barPhoto.status, 'pending'))
      .orderBy(asc(barPhoto.createdAt))
    return { photos }
  }),

  decidePhoto: adminProcedure
    .input(z.object({ photoId: z.string().min(1).max(255) }).and(decision))
    .mutation(({ ctx, input }) =>
      db.transaction(async (tx) => {
        const [photo] = await tx
          .select({
            barId: barPhoto.barId,
            url: barPhoto.url,
            category: barPhoto.category,
            caption: barPhoto.caption,
            coverRequested: barPhoto.coverRequested,
            barName: bar.name
          })
          .from(barPhoto)
          .innerJoin(bar, eq(bar.id, barPhoto.barId))
          .where(
            and(eq(barPhoto.id, input.photoId), eq(barPhoto.status, 'pending'))
          )
          .for('update', { of: barPhoto })
        if (!photo) throw alreadyReviewed()

        const reason = input.approve ? null : input.reason
        await tx
          .update(barPhoto)
          .set({
            status: input.approve ? 'approved' : 'rejected',
            rejectionReason: reason,
            reviewedAt: sql`now()`,
            // Pedido de capa recusado não fica pendurado.
            coverRequested: false
          })
          .where(eq(barPhoto.id, input.photoId))
        // Aprovada e pedida como capa: vira a capa que as listas leem.
        const cover = input.approve && photo.coverRequested
        if (cover) {
          await tx
            .update(bar)
            .set({ photoUrl: photo.url })
            .where(eq(bar.id, photo.barId))
        }
        await recordAdminAction(
          {
            kind: input.approve ? 'bar.photo_approve' : 'bar.photo_reject',
            ...actor(ctx),
            targetType: 'bar',
            targetId: photo.barId,
            targetLabel: photo.barName,
            before: { status: 'pending' },
            after: { status: input.approve ? 'approved' : 'rejected' },
            detail: {
              photoId: input.photoId,
              url: photo.url,
              category: photo.category,
              caption: photo.caption,
              cover,
              reason
            }
          },
          tx
        )
        return { status: input.approve ? 'approved' : 'rejected', cover }
      })
    )
})
