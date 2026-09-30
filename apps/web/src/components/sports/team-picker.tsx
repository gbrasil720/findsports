import { useQueries } from '@tanstack/react-query'
import { CATALOG_QUERY } from '@/lib/query-cache'
import { useTRPC } from '@/utils/trpc'

/** Forma comum a `pubs.getTeamsBySport` e `pubs.getMyTeams`. */
export type FavoriteTeam = { id: string; name: string; sportId: string }

type Props = {
  /** Só os esportes que o torcedor marcou — WEB-68. */
  sports: { id: string; name: string }[]
  selected: FavoriteTeam[]
  onToggle: (team: FavoriteTeam) => void
}

export function toggleFavoriteTeam(
  selected: FavoriteTeam[],
  team: FavoriteTeam
): FavoriteTeam[] {
  return selected.some((t) => t.id === team.id)
    ? selected.filter((t) => t.id !== team.id)
    : [...selected, team]
}

/**
 * Times por esporte escolhido. Uma consulta por esporte, no mesmo cache de
 * catálogo do formulário de evento: são no máximo seis, e o servidor guarda
 * cada lista em `cacheTimes`.
 */
export function TeamPicker({ sports, selected, onToggle }: Props) {
  const trpc = useTRPC()
  const queries = useQueries({
    queries: sports.map((sport) => ({
      ...trpc.pubs.getTeamsBySport.queryOptions({ sportId: sport.id }),
      ...CATALOG_QUERY,
      meta: { errorToast: false }
    }))
  })
  const selectedIds = new Set(selected.map((t) => t.id))

  return (
    <div className="space-y-5">
      {sports.map((sport, index) => {
        const query = queries[index]
        return (
          <fieldset key={sport.id} className="m-0 border-0 p-0">
            <legend className="mb-2 font-bold text-sm">{sport.name}</legend>
            {query?.isLoading ? (
              <p className="text-xs opacity-70" role="status">
                Carregando…
              </p>
            ) : query?.isError ? (
              <p className="text-xs" role="alert">
                Não foi possível carregar.{' '}
                <button
                  type="button"
                  onClick={() => void query.refetch()}
                  className="min-h-11 font-bold underline"
                >
                  Tentar novamente
                </button>
              </p>
            ) : query?.data?.length ? (
              <div className="flex flex-wrap gap-2">
                {query.data.map((team) => (
                  <button
                    key={team.id}
                    type="button"
                    aria-pressed={selectedIds.has(team.id)}
                    onClick={() => onToggle(team)}
                    className="onside-chip"
                  >
                    {team.name}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-xs opacity-70">Nada para escolher aqui.</p>
            )}
          </fieldset>
        )
      })}
    </div>
  )
}

/** Aviso antes de desmarcar esporte com times escolhidos — eles saem junto. */
export function confirmDroppingTeams(dropped: FavoriteTeam[]): boolean {
  return (
    dropped.length === 0 ||
    window.confirm(
      `Você vai deixar de acompanhar ${dropped.map((t) => t.name).join(', ')}. Continuar?`
    )
  )
}
