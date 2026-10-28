import { z } from 'zod'
import { fanProcedure, router } from '../index'
import { CITY_METRICS, RANKING_METRICS } from '../lib/ranking'
import { readCityBoard, readFriendsRanking } from '../lib/ranking-read'

/** Ranking do mês (WEB-409, seção 13 do design do app). Só torcedor. */
export const rankingRouter = router({
  /** Você e os amigos, na métrica escolhida (10d). */
  friends: fanProcedure
    .input(z.object({ metric: z.enum(RANKING_METRICS).default('bars') }))
    .query(({ ctx, input }) =>
      readFriendsRanking(ctx.session.user.id, input.metric)
    ),
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
