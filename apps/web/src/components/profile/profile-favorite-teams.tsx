import { Skeleton } from '@findsports_oficial/ui/components/skeleton'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import Edit from 'reicon-react/icons/Edit'
import Flag from 'reicon-react/icons/Flag'
import {
  type FavoriteTeam,
  TeamPicker,
  toggleFavoriteTeam
} from '@/components/sports/team-picker'
import { getUserFacingMessage } from '@/lib/user-facing-error'
import { useTRPC } from '@/utils/trpc'
import type { Preference } from './profile-model'

type Props = {
  preferences: Preference[]
  loadingPreferences: boolean
}

/** WEB-68: quem o torcedor acompanha, dentro dos esportes favoritos. */
export function ProfileFavoriteTeams({
  preferences,
  loadingPreferences
}: Props) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [selected, setSelected] = useState<FavoriteTeam[]>([])

  const teamsQuery = useQuery({
    ...trpc.pubs.getMyTeams.queryOptions(),
    meta: { errorToast: false }
  })
  const teams = teamsQuery.data ?? []
  const update = useMutation(
    trpc.pubs.updateMyTeams.mutationOptions({
      onSuccess: () => {
        void queryClient.invalidateQueries({
          queryKey: trpc.pubs.getMyTeams.queryKey()
        })
        setEditing(false)
      }
    })
  )
  const loading = loadingPreferences || teamsQuery.isLoading

  return (
    <section
      className="rounded-none border border-[var(--onside-ink)] bg-[var(--onside-paper)] p-6"
      aria-busy={loading || undefined}
    >
      <div className="mb-4 flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-bold text-lg">
          <Flag
            size={20}
            color="currentColor"
            className="text-[var(--onside-live)]"
          />
          Quem você acompanha
        </h3>
        {!editing ? (
          <button
            type="button"
            onClick={() => {
              update.reset()
              setSelected(teams)
              setEditing(true)
            }}
            disabled={loading || teamsQuery.isError}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-none px-3 py-1.5 font-bold text-[var(--onside-muted)] text-xs hover:bg-[var(--onside-stone)] hover:text-[var(--onside-ink)]"
          >
            <Edit size={14} color="currentColor" /> Editar
          </button>
        ) : null}
      </div>

      {loading ? (
        <div className="flex flex-wrap gap-2" role="status" aria-busy="true">
          <span className="sr-only">Carregando quem você acompanha…</span>
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-8 w-32" />
        </div>
      ) : teamsQuery.isError ? (
        <div className="onside-callout onside-callout-danger" role="alert">
          <p className="text-sm">
            {getUserFacingMessage(
              teamsQuery.error,
              'Não foi possível carregar quem você acompanha. Tente novamente.'
            )}
          </p>
          <button
            type="button"
            onClick={() => void teamsQuery.refetch()}
            className="onside-btn onside-btn-outline mt-3 min-h-11"
          >
            Tentar novamente
          </button>
        </div>
      ) : editing ? (
        <div className="onside-profile-sports-editor">
          <TeamPicker
            sports={preferences.map((preference) => preference.sport)}
            selected={selected}
            onToggle={(team) =>
              setSelected((current) => toggleFavoriteTeam(current, team))
            }
          />
          {update.error ? (
            <p
              className="mt-4 text-[var(--onside-live-text)] text-xs"
              role="alert"
            >
              {getUserFacingMessage(
                update.error,
                'Não foi possível salvar. Tente novamente.'
              )}
            </p>
          ) : null}
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() =>
                update.mutate({ teamIds: selected.map((team) => team.id) })
              }
              disabled={update.isPending}
              className="min-h-11 rounded-none bg-[var(--onside-acid)] px-4 py-2 font-bold text-[var(--onside-ink)] text-sm disabled:opacity-50"
            >
              {update.isPending ? 'Salvando…' : 'Salvar'}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="min-h-11 rounded-none px-4 py-2 font-bold text-[var(--onside-muted)] text-sm hover:bg-[var(--onside-stone)]"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : teams.length === 0 ? (
        <p className="text-[var(--onside-muted)] text-sm">
          Ninguém escolhido ainda — é opcional.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {teams.map((team) => (
            <span key={team.id} className="onside-badge onside-badge-acid">
              {team.name}
            </span>
          ))}
        </div>
      )}
    </section>
  )
}
