import { z } from 'zod'

import { fanProcedure, router } from '../index'
import {
  answerPostGame,
  readPendingRatings,
  undoPostGame
} from '../lib/post-game'
import { ratingReasonsSchema } from '../lib/rating-reasons'

/**
 * Adaptadores dos cards do `/dashboard`. A avaliação mora em `postGame`
 * (`lib/post-game.ts`), junto do "Você foi?"; estes três saem quando o web
 * do torcedor for refeito sobre ela.
 */
export const ratingsRouter = router({
  /** `postGame.pending`, itens com `rating`. */
  getPending: fanProcedure.query(({ ctx }) =>
    readPendingRatings(ctx.session.user.id)
  ),

  /**
   * `postGame.answer` com `rating`. Sem estrelas, comentário nem nome: elas
   * são opcionais no servidor, e o card antigo não as pergunta.
   */
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

  /** `postGame.undo` com `rating`. */
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
