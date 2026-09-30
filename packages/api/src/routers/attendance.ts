import { and, db, eq } from '@findsports_oficial/db'
import { attendance } from '@findsports_oficial/db/schema/attendance'
import { event } from '@findsports_oficial/db/schema/platform'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import { fanProcedure, router } from '../index'

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
    })
})
