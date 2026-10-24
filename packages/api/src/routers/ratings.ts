import { z } from 'zod'

import { fanProcedure, router } from '../index'
import {
  answerPostGame,
  readPendingRatings,
  undoPostGame
} from '../lib/post-game'
import { ratingReasonsSchema } from '../lib/rating-reasons'

/**
 * @deprecated A avaliação mora em `postGame` (`lib/post-game.ts`), junto do
 * "Você foi?". Estes três são adaptadores para o web publicado antes da troca
 * (aba aberta com o bundle anterior); saem quando ele não os chamar mais.
 */
export const ratingsRouter = router({
  /** @deprecated `postGame.pending`, itens com `rating`. */
  getPending: fanProcedure.query(({ ctx }) =>
    readPendingRatings(ctx.session.user.id)
  ),

  /** @deprecated `postGame.answer` com `rating`. */
  submit: fanProcedure
    .input(
      z.object({
        barId: z.string().uuid(),
        eventId: z.string().uuid(),
        wouldReturn: z.boolean(),
        reasons: ratingReasonsSchema.default([])
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { barId, eventId, ...rating } = input
      await answerPostGame(ctx.session.user.id, { eventId, barId, rating })
      return { success: true }
    }),

  /** @deprecated `postGame.undo` com `rating`. */
  remove: fanProcedure
    .input(z.object({ barId: z.string().uuid(), eventId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await undoPostGame(ctx.session.user.id, {
        eventId: input.eventId,
        rating: true
      })
      return { success: true }
    })
})
