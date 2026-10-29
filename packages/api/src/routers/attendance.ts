import { db } from '@findsports_oficial/db'
import { recommendationEvent } from '@findsports_oficial/db/schema/recommendation'
import { z } from 'zod'

import { adminProcedure, fanProcedure, router } from '../index'
import {
  readAttendanceQuestions,
  readMyGames,
  readUnregisteredAlerts,
  readVisitedGames,
  setAttendance
} from '../lib/attendance'
import { checkIn } from '../lib/check-in'
import { answerPostGame, undoPostGame } from '../lib/post-game'

/**
 * "Vou assistir aqui" (WEB-127): o torcedor marca e desmarca presença num
 * jogo futuro. A regra é de `setAttendance` (`lib/attendance.ts`), o mesmo
 * caminho do "Confirmar" da IA e do "Vou também" de um chamado.
 */
export const attendanceRouter = router({
  set: fanProcedure
    .input(
      z.object({
        eventId: z.string().uuid(),
        attending: z.boolean(),
        // "Vou assistir" a partir do card de "Bares pra você" (WEB-425, 22e).
        recommendationRunId: z.string().uuid().optional()
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id
      const { barId, ...marked } = await setAttendance({
        userId,
        eventId: input.eventId,
        attending: input.attending
      })
      if (input.attending && input.recommendationRunId) {
        // Atribuição é telemetria: falhar aqui não desfaz a presença.
        await db
          .insert(recommendationEvent)
          .values({
            actorUserId: userId,
            barId,
            runId: input.recommendationRunId,
            type: 'attend'
          })
          .onConflictDoNothing()
          .catch(() => {})
      }
      // O código vem na resposta: a tela o mostra sem esperar o perfil recarregar.
      return marked
    }),

  /**
   * "Estou aqui" (WEB-408): check-in por localização durante o jogo. O app
   * só manda a posição; distância e horário são conferidos em `checkIn`.
   */
  checkIn: fanProcedure
    .input(
      z.object({
        eventId: z.string().uuid(),
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180)
      })
    )
    .mutation(({ ctx, input }) => checkIn(ctx.session.user.id, input)),

  /** "Meus jogos": onde o torcedor marcou que vai, com o código. */
  mine: fanProcedure.query(({ ctx }) => readMyGames(ctx.session.user.id)),
  /** Os jogos com código validado: o "Já fui" de Seus bares. */
  visits: fanProcedure.query(({ ctx }) =>
    readVisitedGames(ctx.session.user.id)
  ),

  /** @deprecated `postGame.pending`, itens com `presence` (web publicado antes da troca). */
  pendingReports: fanProcedure.query(async ({ ctx }) =>
    (await readAttendanceQuestions(ctx.session.user.id)).filter(
      (question) => !question.answered
    )
  ),

  /** @deprecated `postGame.answer` com `attended`. */
  report: fanProcedure
    .input(
      z.object({
        eventId: z.string().uuid(),
        attended: z.boolean(),
        offerReceived: z.boolean().optional()
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { attended, offerReceived } = await answerPostGame(
        ctx.session.user.id,
        input
      )
      return { attended, offerReceived }
    }),

  /** @deprecated `postGame.undo` com `presence`. */
  removeReport: fanProcedure
    .input(z.object({ eventId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await undoPostGame(ctx.session.user.id, {
        eventId: input.eventId,
        presence: true
      })
      return { success: true }
    }),

  /** Alerta interno de "foi, mas o bar não registrou" repetido. */
  unregisteredAlerts: adminProcedure.query(() => readUnregisteredAlerts())
})
