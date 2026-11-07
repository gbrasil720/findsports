import { z } from 'zod'

import { adminProcedure, fanProcedure, router } from '../index'
import {
  readAttendanceQuestions,
  readMyGames,
  readUnregisteredAlerts,
  readUnvalidatedCodeAlerts,
  readVisitedGames,
  setAttendance
} from '../lib/attendance'
import { checkIn } from '../lib/check-in'
import { answerPostGame, undoPostGame } from '../lib/post-game'

/**
 * "Vou assistir aqui" (WEB-127): o torcedor marca e desmarca presença num
 * jogo futuro. A regra é de `setAttendance` (`lib/attendance.ts`).
 */
export const attendanceRouter = router({
  set: fanProcedure
    .input(z.object({ eventId: z.string().uuid(), attending: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const { barId: _barId, ...marked } = await setAttendance({
        userId: ctx.session.user.id,
        eventId: input.eventId,
        attending: input.attending
      })
      // O código vem na resposta: a tela o mostra sem esperar o perfil recarregar.
      return marked
    }),

  /** "Meus jogos": onde o torcedor marcou que vai, com o código. */
  mine: fanProcedure.query(({ ctx }) => readMyGames(ctx.session.user.id)),
  /** Os jogos com código validado: o "Já fui" de Seus bares. */
  visits: fanProcedure.query(({ ctx }) =>
    readVisitedGames(ctx.session.user.id)
  ),

  /**
   * "Estou aqui" (WEB-408): check-in por localização durante o jogo. O
   * cliente só manda a posição; distância e horário são conferidos em
   * `checkIn`. O web não tem tela: quem chama é o app.
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

  /**
   * Perguntas pós-jogo ainda sem resposta (WEB-128). Uma por jogo; a tela
   * mostra uma de cada vez. O mesmo que os itens com `presence` de
   * `postGame.pending`, para o card do `/dashboard`.
   */
  pendingReports: fanProcedure.query(async ({ ctx }) =>
    (await readAttendanceQuestions(ctx.session.user.id)).filter(
      (question) => !question.answered
    )
  ),

  /** Adaptador do card do `/dashboard`: `postGame.answer` com `attended`. */
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

  /** Adaptador do "Desfazer" do card: `postGame.undo` com `presence`. */
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
  unregisteredAlerts: adminProcedure.query(() => readUnregisteredAlerts()),

  /** Alerta interno de jogo encerrado com códigos e nenhum validado. */
  unvalidatedCodeAlerts: adminProcedure.query(() => readUnvalidatedCodeAlerts())
})
