import { z } from 'zod'
import { fanProcedure, router } from '../index'
import { RANKING_METRICS } from '../lib/ranking'
import { readCityPosition, readFriendsRanking } from '../lib/ranking-read'

/** Ranking do mês (WEB-409, seção 13 do design do app). Só torcedor. */
export const rankingRouter = router({
  /** Você e os amigos, na métrica escolhida (10d). */
  friends: fanProcedure
    .input(z.object({ metric: z.enum(RANKING_METRICS).default('bars') }))
    .query(({ ctx, input }) =>
      readFriendsRanking(ctx.session.user.id, input.metric)
    ),
  /** A sua posição na cidade do perfil, em bares no mês (11e). */
  city: fanProcedure.query(({ ctx }) => readCityPosition(ctx.session.user.id))
})
