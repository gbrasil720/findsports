import { and, db, eq } from '@findsports_oficial/db'
import { attendanceReport } from '@findsports_oficial/db/schema/attendance'
import { recommendationEvent } from '@findsports_oficial/db/schema/recommendation'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import { adminProcedure, fanProcedure, router } from '../index'
import {
  readAttendanceQuestions,
  readMyGames,
  readUnregisteredAlerts,
  readVisitedGames,
  setAttendance
} from '../lib/attendance'

/** A pergunta pós-jogo deste torcedor, se ainda estiver aberta. */
async function openQuestion(userId: string, eventId: string) {
  const [question] = await readAttendanceQuestions(userId, eventId)
  if (!question) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Não há pergunta aberta para este jogo.'
    })
  }
  return question
}

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

  /** "Meus jogos": onde o torcedor marcou que vai, com o código. */
  mine: fanProcedure.query(({ ctx }) => readMyGames(ctx.session.user.id)),
  /** Os jogos com código validado: o "Já fui" de Seus bares. */
  visits: fanProcedure.query(({ ctx }) =>
    readVisitedGames(ctx.session.user.id)
  ),

  /**
   * Perguntas pós-jogo ainda sem resposta (WEB-128). Uma por jogo; a tela
   * mostra uma de cada vez.
   */
  pendingReports: fanProcedure.query(async ({ ctx }) =>
    (await readAttendanceQuestions(ctx.session.user.id)).filter(
      (question) => !question.answered
    )
  ),

  /**
   * Resposta do torcedor: se foi e, só quando a reserva confirmada tinha
   * oferta congelada, se recebeu. Responder de novo dentro da janela troca a
   * resposta. Não toca no registro do bar: as fontes ficam separadas.
   */
  report: fanProcedure
    .input(
      z.object({
        eventId: z.string().uuid(),
        attended: z.boolean(),
        offerReceived: z.boolean().optional()
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id
      const question = await openQuestion(userId, input.eventId)
      // Pergunta que não foi feita não tem resposta gravada.
      const offerReceived =
        question.offer !== null && input.attended
          ? (input.offerReceived ?? null)
          : null
      await db
        .insert(attendanceReport)
        .values({
          userId,
          eventId: input.eventId,
          attended: input.attended,
          offerReceived
        })
        .onConflictDoUpdate({
          target: [attendanceReport.userId, attendanceReport.eventId],
          set: { attended: input.attended, offerReceived }
        })
      return { attended: input.attended, offerReceived }
    }),

  /**
   * "Desfazer" do aviso de confirmação (WEB-321): apaga a resposta do próprio
   * torcedor e a pergunta volta a `pendingReports`. Vale enquanto `report`
   * vale. Sem resposta gravada não há o que apagar, e não é erro. Nada é
   * materializado a partir da resposta: o alerta interno conta na leitura.
   */
  removeReport: fanProcedure
    .input(z.object({ eventId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id
      await openQuestion(userId, input.eventId)
      await db
        .delete(attendanceReport)
        .where(
          and(
            eq(attendanceReport.userId, userId),
            eq(attendanceReport.eventId, input.eventId)
          )
        )
      return { success: true }
    }),

  /** Alerta interno de "foi, mas o bar não registrou" repetido. */
  unregisteredAlerts: adminProcedure.query(() => readUnregisteredAlerts())
})
