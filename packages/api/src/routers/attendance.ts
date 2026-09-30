import { and, db, eq } from '@findsports_oficial/db'
import {
  attendance,
  attendanceReport
} from '@findsports_oficial/db/schema/attendance'
import { event } from '@findsports_oficial/db/schema/platform'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import { adminProcedure, fanProcedure, router } from '../index'
import {
  readAttendanceQuestions,
  readUnregisteredAlerts
} from '../lib/attendance'

/**
 * "Vou assistir aqui" (WEB-127): o torcedor marca e desmarca presença num
 * jogo futuro. Vale para bar de qualquer plano (ADR 0003, "Recorte de
 * plano"). Repetir a mesma marcação devolve o mesmo estado.
 */
export const attendanceRouter = router({
  set: fanProcedure
    .input(z.object({ eventId: z.string().uuid(), attending: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id
      const game = await db.query.event.findFirst({
        where: eq(event.id, input.eventId),
        columns: { startsAt: true },
        with: { bar: { columns: { isActive: true } } }
      })
      if (!game?.bar.isActive) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Jogo não encontrado.'
        })
      }
      // Jogo encerrado vira histórico do sinal de interesse do bar: não muda.
      if (game.startsAt <= new Date()) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Este jogo já começou.'
        })
      }

      if (input.attending) {
        await db
          .insert(attendance)
          .values({ userId, eventId: input.eventId })
          .onConflictDoNothing()
      } else {
        await db
          .delete(attendance)
          .where(
            and(
              eq(attendance.userId, userId),
              eq(attendance.eventId, input.eventId)
            )
          )
      }
      return { attending: input.attending }
    }),

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
      const [question] = await readAttendanceQuestions(userId, input.eventId)
      if (!question) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Não há pergunta aberta para este jogo.'
        })
      }
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

  /** Alerta interno de "foi, mas o bar não registrou" repetido. */
  unregisteredAlerts: adminProcedure.query(() => readUnregisteredAlerts())
})
