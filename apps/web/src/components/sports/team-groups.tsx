import type { ReactNode } from 'react'

export type TeamGroupLabel = 'Clubes' | 'Seleções'

/**
 * WEB-284: separa clubes de seleções dentro de um esporte. Preserva a ordem
 * recebida — `pubs.getTeamsBySport` já entrega em ordem alfabética pt-BR.
 * Esporte com um tipo só devolve um grupo sem rótulo: subtítulo único não
 * informa nada (NBA, F1, UFC).
 */
export function groupTeamsByKind<T extends { isNationalTeam?: boolean }>(
  teams: T[]
): { label: TeamGroupLabel | null; teams: T[] }[] {
  const clubs = teams.filter((team) => !team.isNationalTeam)
  const nationalTeams = teams.filter((team) => team.isNationalTeam)
  if (clubs.length === 0 || nationalTeams.length === 0) {
    return teams.length > 0 ? [{ label: null, teams }] : []
  }
  return [
    { label: 'Clubes', teams: clubs },
    { label: 'Seleções', teams: nationalTeams }
  ]
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
