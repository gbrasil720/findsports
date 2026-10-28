import { and, asc, db, eq, sql } from '@findsports_oficial/db'
import { recordAdminAction } from '@findsports_oficial/db/admin-action'
import { REVIEW_REASON_MAX } from '@findsports_oficial/db/bar-gallery'
import { bar, barPhoto } from '@findsports_oficial/db/schema/platform'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import { adminProcedure, router } from '../index'

/**
 * Revisão da Onside (WEB-462, WEB-478): toda foto do bar e a descrição em
 * texto livre passam por aqui antes de o torcedor ver. Aprovar ou recusar com motivo; cada decisão fica no
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
    const descriptions = await db
      .select({
        barId: bar.id,
        barName: bar.name,
        published: bar.description,
        pending: bar.descriptionPending,
        submittedAt: bar.descriptionSubmittedAt
      })
      .from(bar)
      .where(eq(bar.descriptionReview, 'pending'))
      .orderBy(asc(bar.descriptionSubmittedAt))
    return { photos, descriptions }
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
    ),

  /**
   * A descrição em texto livre (WEB-478). `text` é o que o admin leu: se o
   * dono mudou o texto no meio, a decisão é recusada e a fila recarrega.
   * Aprovada, vira a publicada; recusada, o dono lê o motivo e o torcedor
   * segue com a anterior.
   */
  decideDescription: adminProcedure
    .input(
      z
        .object({
          barId: z.string().min(1).max(255),
          text: z.string().max(1000)
        })
        .and(decision)
    )
    .mutation(({ ctx, input }) =>
      db.transaction(async (tx) => {
        const [found] = await tx
          .select({
            name: bar.name,
            published: bar.description,
            pending: bar.descriptionPending
          })
          .from(bar)
          .where(
            and(
              eq(bar.id, input.barId),
              eq(bar.descriptionReview, 'pending'),
              eq(bar.descriptionPending, input.text)
            )
          )
          .for('update')
        if (!found) throw alreadyReviewed()

        const reason = input.approve ? null : input.reason
        await tx
          .update(bar)
          .set(
            input.approve
              ? {
                  description: found.pending,
                  descriptionPending: null,
                  descriptionReview: null,
                  descriptionRejectionReason: null,
                  descriptionSubmittedAt: null
                }
              : {
                  descriptionReview: 'rejected',
                  descriptionRejectionReason: reason
                }
          )
          .where(eq(bar.id, input.barId))
        await recordAdminAction(
          {
            kind: input.approve
              ? 'bar.description_approve'
              : 'bar.description_reject',
            ...actor(ctx),
            targetType: 'bar',
            targetId: input.barId,
            targetLabel: found.name,
            before: { description: found.published },
            after: {
              description: input.approve ? found.pending : found.published
            },
            detail: { submitted: found.pending, reason }
          },
          tx
        )
        return { status: input.approve ? 'approved' : 'rejected' }
      })
    )
})
