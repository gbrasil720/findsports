import type { ReactNode } from 'react'

export type TeamGroupLabel = 'Clubes' | 'Times' | 'Seleções' | 'Atletas'

/**
 * WEB-284: separa clubes de seleções dentro de um esporte; WEB-381: e times
 * de atletas (escuderias e pilotos na F1). Preserva a ordem recebida —
 * `pubs.getTeamsBySport` já entrega em ordem alfabética pt-BR. Esporte com um
 * tipo só devolve um grupo sem rótulo: subtítulo único não informa nada (NBA,
 * UFC).
 */
export function groupTeamsByKind<
  T extends { isNationalTeam?: boolean; kind?: 'team' | 'athlete' }
>(teams: T[]): { label: TeamGroupLabel | null; teams: T[] }[] {
  const athletes = teams.filter((team) => team.kind === 'athlete')
  const clubs = teams.filter(
    (team) => team.kind !== 'athlete' && !team.isNationalTeam
  )
  const nationalTeams = teams.filter(
    (team) => team.kind !== 'athlete' && team.isNationalTeam
  )
  const groups = [
    // Ao lado de atletas, "clube" não serve: a Ferrari é time, não clube.
    { label: athletes.length ? 'Times' : 'Clubes', teams: clubs },
    { label: 'Seleções', teams: nationalTeams },
    { label: 'Atletas', teams: athletes }
  ] as const
  const filled = groups.filter((group) => group.teams.length > 0)
  if (filled.length <= 1) {
    return teams.length > 0 ? [{ label: null, teams }] : []
  }
  return filled.map((group) => ({ label: group.label, teams: group.teams }))
}

/** Chips de um grupo; com rótulo, vira `group` nomeado dentro do esporte. */
export function TeamGroup({
  label,
  children
}: {
  label: TeamGroupLabel | null
  children: ReactNode
}) {
  const chips = <div className="flex flex-wrap gap-2">{children}</div>
  return label ? (
    <fieldset className="m-0 border-0 p-0">
      <legend className="mb-1.5 text-xs opacity-70">{label}</legend>
      {chips}
    </fieldset>
  ) : (
    chips
  )
}
