import { db } from '@findsports_oficial/db'
import { recommendationEvent } from '@findsports_oficial/db/schema/recommendation'
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
import { createFriendCall, readSentCalls } from '../lib/friend-calls'
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
        recommendationRunId: z.string().uuid().optional(),
        // "Chamar para o jogo" da folha (rodada 3): os amigos saem junto com
        // a confirmação, pela regra do chamado de sempre (só amigo aceito,
        // só antes do jogo, um por amigo e jogo).
        callFriendIds: z.array(z.string().min(1).max(64)).max(12).optional()
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
      // Chamado que não sai (amizade desfeita, repetido) não desfaz a
      // presença: só fica de fora da frase do ingresso.
      const called: string[] = []
      if (input.attending)
        for (const toUserId of input.callFriendIds ?? []) {
          const sent = await createFriendCall({
            fromUserId: userId,
            toUserId,
            eventId: input.eventId,
            barId
          }).catch(() => null)
          if (sent?.ok) called.push(sent.friendName)
        }
      // O código vem na resposta: a tela o mostra sem esperar o perfil recarregar.
      return { ...marked, called }
    }),

  /** Os amigos que a pessoa chamou para este jogo (o ingresso, rodada 3). */
  sentCalls: fanProcedure
    .input(z.object({ eventId: z.string().uuid() }))
    .query(({ ctx, input }) =>
      readSentCalls(ctx.session.user.id, input.eventId)
    ),

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
