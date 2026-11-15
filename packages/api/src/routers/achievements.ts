import { z } from 'zod'
import { fanProcedure, router } from '../index'
import { findSecret, readAchievements } from '../lib/achievements-read'

/** Conquistas e nível do torcedor (WEB-403, seção 09 do design). */
export const achievementsRouter = router({
  mine: fanProcedure.query(({ ctx }) => readAchievements(ctx.session.user.id)),

  /**
   * "Achou o Jules" (WEB-558): tocar no Jules parado no app ou buscar
   * "jules" no Explorar do web. Grava uma vez; `isNew` diz se é a primeira,
   * para o app abrir a conquista e o web mostrar o aviso só nessa hora.
   */
  findJules: fanProcedure
    .input(z.object({ via: z.enum(['app', 'web']) }))
    .mutation(({ ctx, input }) =>
      findSecret(ctx.session.user.id, 'jules', input.via)
    )
})
