import { z } from 'zod'
import { fanProcedure, router } from '../index'
import { CITY_METRICS, RANKING_METRICS } from '../lib/ranking'
import {
  readCityBoard,
  readCrowns,
  readFriendsRanking,
  settleMonthCrown
} from '../lib/ranking-read'

/** Ranking do mês (WEB-409, seção 13 do design do app). Só torcedor. */
export const rankingRouter = router({
  /** Você e os amigos, na métrica escolhida (10d). */
  friends: fanProcedure
    .input(z.object({ metric: z.enum(RANKING_METRICS).default('bars') }))
    .query(async ({ ctx, input }) => {
      const me = ctx.session.user.id
      await settleMonthCrown(me)
      const [board, crowns] = await Promise.all([
        readFriendsRanking(me, input.metric),
        readCrowns(me)
      ])
      return { ...board, crowns }
    }),
  /** Os selos do mês de quem está na conta (perfil e carteirinha). */
  crowns: fanProcedure.query(async ({ ctx }) => {
    await settleMonthCrown(ctx.session.user.id)
    return readCrowns(ctx.session.user.id)
  }),
  /**
   * A cidade do perfil (10e, 27a–27c; WEB-465): o top, a sua posição e a
   * vizinhança, página por posição. Fora do ranking global, só o porquê.
   */
  city: fanProcedure
    .input(
      z.object({
        metric: z.enum(CITY_METRICS).default('bars'),
        cursor: z.number().int().min(0).default(0)
      })
    )
    .query(({ ctx, input }) =>
      readCityBoard(ctx.session.user.id, input.metric, input.cursor)
    )
})
