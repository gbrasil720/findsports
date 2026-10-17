import { fanProcedure, router } from '../index'
import { readAchievements } from '../lib/achievements-read'

/** Conquistas e nível do torcedor (WEB-403, seção 09 do design). */
export const achievementsRouter = router({
  mine: fanProcedure.query(({ ctx }) => readAchievements(ctx.session.user.id))
})
