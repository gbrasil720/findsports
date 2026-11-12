import { and, db, eq, inArray } from '@findsports_oficial/db'
import { barTeam, team } from '@findsports_oficial/db/schema/platform'
import { z } from 'zod'

/*
 * "Times da casa" (WEB-433): os times que o bar escolhe, opcional, no Meu
 * espaço (web e app) e na rotina do cadastro. Pesam nas sugestões dos jogos
 * da semana (`game-suggestions/rank.ts`) e dão o "Seu time" no card.
 */

/** Poucos: é "a casa do Palmeiras", não a lista de quem o bar passa. */
export const HOUSE_TEAMS_MAX = 5

export const houseTeamIdsSchema = z
  .array(z.string().uuid())
  .max(HOUSE_TEAMS_MAX, `Escolha até ${HOUSE_TEAMS_MAX} times.`)

type Executor = Pick<typeof db, 'select' | 'insert' | 'delete'>

export function readHouseTeamList(barId: string) {
  return db
    .select({ id: team.id, name: team.name, sportId: team.sportId })
    .from(barTeam)
    .innerJoin(team, eq(team.id, barTeam.teamId))
    .where(eq(barTeam.barId, barId))
    .orderBy(barTeam.createdAt, team.name)
}

/**
 * Troca os times da casa. Só clube conta (sem seleção nem atleta, como a
 * busca com `clubsOnly`); o resto fica de fora sem recusar.
 */
export async function replaceHouseTeams(
  tx: Executor,
  barId: string,
  teamIds: readonly string[]
) {
  await tx.delete(barTeam).where(eq(barTeam.barId, barId))
  const ids = [...new Set(teamIds)]
  if (!ids.length) return
  const known = await tx
    .select({ id: team.id })
    .from(team)
    .where(
      and(
        inArray(team.id, ids),
        eq(team.kind, 'team'),
        eq(team.isNationalTeam, false)
      )
    )
  if (!known.length) return
  await tx
    .insert(barTeam)
    .values(known.map((t) => ({ barId, teamId: t.id })))
    .onConflictDoNothing()
}
