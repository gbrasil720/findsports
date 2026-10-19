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
  readMyGames,
  readUnregisteredAlerts
} from '../lib/attendance'
import { issueTicket, readTicket, retireTicket } from '../lib/attendance-ticket'
import { getCurrentPlan } from '../lib/current-plan'

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
 * jogo futuro. Vale para bar de qualquer plano (ADR 0003, "Recorte de
 * plano"); no bar Elite, marcar também emite o código do balcão, que dá a
 * oferta da casa (`attendance-ticket.ts`). Repetir a mesma marcação devolve
 * o mesmo estado.
 */
export const attendanceRouter = router({
  set: fanProcedure
    .input(z.object({ eventId: z.string().uuid(), attending: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id
      const now = new Date()
      const game = await db.query.event.findFirst({
        where: eq(event.id, input.eventId),
        columns: { startsAt: true },
        with: {
          bar: {
            columns: {
              isActive: true,
              houseOffer: true,
              confirmsCodesLater: true
            },
            with: {
              subscription: {
                columns: { plan: true, status: true, currentPeriodEnd: true }
              }
            }
          }
        }
      })
      if (!game?.bar.isActive) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Jogo não encontrado.'
        })
      }
      // Jogo encerrado vira histórico do sinal de interesse do bar: não muda.
      if (game.startsAt <= now) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Este jogo já começou.'
        })
      }

      const ticket = await db.transaction(async (tx) => {
        if (input.attending) {
          await tx
            .insert(attendance)
            .values({ userId, eventId: input.eventId })
            .onConflictDoUpdate({
              target: [attendance.userId, attendance.eventId],
              set: { source: 'manual' }
            })
          if (getCurrentPlan(game.bar.subscription ?? null, now) === 'elite') {
            await issueTicket(tx, userId, input.eventId, game.bar.houseOffer)
            return readTicket(tx, userId, input.eventId)
          }
        } else {
          // O ingresso sai antes da presença: código validado recusa tudo.
          await retireTicket(tx, userId, input.eventId)
          await tx
            .delete(attendance)
            .where(
              and(
                eq(attendance.userId, userId),
                eq(attendance.eventId, input.eventId)
              )
            )
        }
        return null
      })
      // O código vem na resposta: a tela o mostra sem esperar o perfil recarregar.
      return {
        attending: input.attending,
        code: ticket?.code ?? null,
        offer: ticket?.offer ?? null,
        // O diálogo do código fala com o garçom (WEB-412).
        confirmsCodesLater: ticket ? game.bar.confirmsCodesLater : false
      }
    }),

  /** "Meus jogos": onde o torcedor marcou que vai, com o código. */
  mine: fanProcedure.query(({ ctx }) => readMyGames(ctx.session.user.id)),

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
