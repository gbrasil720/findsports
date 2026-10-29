import { z } from 'zod'

import { fanProcedure, router } from '../index'
import { answerPostGame, readPostGame, undoPostGame } from '../lib/post-game'
import { ratingReasonsSchema } from '../lib/rating-reasons'
import { ratingDetailsSchema } from '../lib/rating-review'

const eventId = z.string().uuid()

/**
 * Pós-jogo (3g): "Você foi?" e "Voltaria?" numa fila só, um item por jogo,
 * e uma resposta numa transação (`lib/post-game.ts`).
 */
export const postGameRouter = router({
  /** Os jogos com pergunta aberta, do mais recente ao mais antigo. */
  pending: fanProcedure.query(({ ctx }) => readPostGame(ctx.session.user.id)),

  /** Presença, nota ou as duas; "Não fui" com nota é recusado. */
  answer: fanProcedure
    .input(
      z.object({
        eventId,
        attended: z.boolean().optional(),
        offerReceived: z.boolean().optional(),
        rating: z
          .object({
            wouldReturn: z.boolean(),
            // "O que pesou?" (WEB-398), opcional. Reenviar troca as etiquetas.
            reasons: ratingReasonsSchema.default([])
          })
          // Estrelas, comentário e nome (WEB-451). Opcionais aqui porque o
          // app publicado antes deles ainda manda só "voltaria" e etiquetas;
          // o pós-jogo novo exige as estrelas na tela.
          .extend(ratingDetailsSchema.partial().shape)
          .optional()
      })
    )
    .mutation(({ ctx, input }) => answerPostGame(ctx.session.user.id, input)),

  /** "Desfazer" do aviso (WEB-321): a parte pedida volta à fila. */
  undo: fanProcedure
    .input(
      z.object({
        eventId,
        presence: z.boolean().optional(),
        rating: z.boolean().optional()
      })
    )
    .mutation(async ({ ctx, input }) => {
      await undoPostGame(ctx.session.user.id, input)
      return { success: true }
    })
})
