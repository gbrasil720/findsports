import { and, type db, eq, inArray } from '@findsports_oficial/db'
import {
  team,
  userFavoriteTeams,
  userPreferenceSports
} from '@findsports_oficial/db/schema/platform'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

/** Teto de confiança: o catálogo inteiro do seed tem ~150 times. */
export const favoriteTeamIdsSchema = z.array(z.string().uuid()).max(200)

/**
 * WEB-68: troca os times que o torcedor acompanha. Só aceita time de um
 * esporte que já está em `user_preference_sports` — chame depois de gravar
 * os esportes, na mesma transação. A FK composta garante o mesmo invariante
 * no banco; a checagem aqui existe para devolver 400 em vez de 500.
 */
export async function replaceFavoriteTeams(
  tx: Transaction,
  userId: string,
  teamIds: string[]
): Promise<void> {
  await tx.delete(userFavoriteTeams).where(eq(userFavoriteTeams.userId, userId))

  const uniqueIds = [...new Set(teamIds)]
  if (uniqueIds.length === 0) return

  const allowed = await tx
    .select({ teamId: team.id, sportId: team.sportId })
    .from(team)
    .innerJoin(
      userPreferenceSports,
      and(
        eq(userPreferenceSports.sportId, team.sportId),
        eq(userPreferenceSports.userId, userId)
      )
    )
    .where(inArray(team.id, uniqueIds))

  if (allowed.length !== uniqueIds.length) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Escolha apenas times dos seus esportes favoritos.'
    })
  }

  await tx
    .insert(userFavoriteTeams)
    .values(allowed.map((row) => ({ userId, ...row })))
}
