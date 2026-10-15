import {
  keepPreviousData,
  useMutation,
  useQueries,
  useQuery
} from '@tanstack/react-query'
import { useEffect, useId, useState } from 'react'
import { CATALOG_QUERY } from '@/lib/query-cache'
import { useTRPC } from '@/utils/trpc'
import { groupTeamsByKind, TeamGroup } from './team-groups'

/** Forma comum a `pubs.getTeamsBySport`, `pubs.searchTeams` e `pubs.getMyTeams`. */
export type FavoriteTeam = { id: string; name: string; sportId: string }

type Props = {
  /** Só os esportes que o torcedor marcou — WEB-68. */
  sports: { id: string; name: string }[]
  selected: FavoriteTeam[]
  onChange: (selected: FavoriteTeam[]) => void
  /** Fundo escuro (onboarding). */
  ink?: boolean
}

function toggleFavoriteTeam(
  selected: FavoriteTeam[],
  team: FavoriteTeam
): FavoriteTeam[] {
  return selected.some((t) => t.id === team.id)
    ? selected.filter((t) => t.id !== team.id)
    : [...selected, team]
}

/**
 * WEB-381: busca no catálogo inteiro dos esportes, a partir de duas letras. O
 * termo espera o dedo parar (250 ms) antes de ir ao servidor.
 */
export function useTeamSearch(sportIds: string[]) {
  const trpc = useTRPC()
  const [text, setText] = useState('')
  const [query, setQuery] = useState('')
  useEffect(() => {
    const timer = setTimeout(() => setQuery(text.trim()), 250)
    return () => clearTimeout(timer)
  }, [text])
  const active = text.trim().length >= 2 && sportIds.length > 0
  const results = useQuery({
    ...trpc.pubs.searchTeams.queryOptions({ sportIds, query }),
    enabled: active && query.length >= 2,
    placeholderData: keepPreviousData,
    meta: { errorToast: false }
  })
  return { text, setText, query, active, results }
}

export function TeamSearchField({
  value,
  onChange,
  ink
}: {
  value: string
  onChange: (value: string) => void
  ink?: boolean
}) {
  const id = useId()
  return (
    <div className="max-w-md">
      <label
        htmlFor={id}
        className={`onside-label ${ink ? 'onside-label-ink' : ''}`}
      >
        Buscar time ou atleta
      </label>
      <input
        id={id}
        // `text`, e não `search`: o "x" nativo do Safari sai azul no fundo escuro.
        type="text"
        inputMode="search"
        enterKeyHint="search"
        autoComplete="off"
        maxLength={60}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`onside-input ${ink ? 'onside-input-ink' : ''}`}
      />
    </div>
  )
}

/**
 * O torcedor não achou o time: vai como feedback (`feedback.send`), e entra
 * no catálogo depois de revisado. Uma sugestão por termo.
 */
export function SuggestTeam({
  name,
  sports
}: {
  name: string
  sports: { name: string }[]
}) {
  const trpc = useTRPC()
  const send = useMutation(trpc.feedback.send.mutationOptions())
  if (send.isSuccess) {
    return (
      <p className="text-xs" role="status">
        Recebemos a sugestão de “{name}”. A gente revisa antes de incluir.
      </p>
    )
  }
  return (
    <p className="text-xs">
      Não achou?{' '}
      <button
        type="button"
        disabled={send.isPending}
        onClick={() =>
          send.mutate({
            message: `Sugestão para o catálogo de times e atletas: “${name}” (${sports.map((sport) => sport.name).join(', ')}).`,
            pageUrl: window.location.href
          })
        }
        className="min-h-11 font-bold underline"
      >
        Sugerir “{name}”
      </button>
      {send.isError ? (
        <span role="alert"> Não deu para enviar. Tente de novo.</span>
      ) : null}
    </p>
  )
}

function TeamChip({
  team,
  pressed,
  onToggle
}: {
  team: FavoriteTeam
  pressed: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onToggle}
      className="onside-chip"
    >
      {team.name}
    </button>
  )
}

/**
 * Times por esporte escolhido. Sem busca, os em destaque de cada esporte (uma
 * consulta por esporte, no mesmo cache de catálogo do formulário de evento) e
 * os já escolhidos que não estão entre eles; com busca, o catálogo inteiro.
 */
export function TeamPicker({ sports, selected, onChange, ink }: Props) {
  const trpc = useTRPC()
  const queries = useQueries({
    queries: sports.map((sport) => ({
      ...trpc.pubs.getTeamsBySport.queryOptions({ sportId: sport.id }),
      ...CATALOG_QUERY,
      meta: { errorToast: false }
    }))
  })
  const search = useTeamSearch(sports.map((sport) => sport.id))
  const selectedIds = new Set(selected.map((t) => t.id))
  const chip = (team: FavoriteTeam) => (
    <TeamChip
      key={team.id}
      team={team}
      pressed={selectedIds.has(team.id)}
      onToggle={() => onChange(toggleFavoriteTeam(selected, team))}
    />
  )

  return (
    <div className="space-y-5">
      <TeamSearchField
        ink={ink}
        value={search.text}
        onChange={search.setText}
      />
      {search.active ? (
        <div className="space-y-4" aria-live="polite">
          {search.results.isError ? (
            <p className="text-xs" role="alert">
              Não foi possível buscar.{' '}
              <button
                type="button"
                onClick={() => void search.results.refetch()}
                className="min-h-11 font-bold underline"
              >
                Tentar novamente
              </button>
            </p>
          ) : !search.results.data ? (
            <p className="text-xs opacity-70" role="status">
              Buscando…
            </p>
          ) : search.results.data.length === 0 ? (
            <p className="text-xs opacity-70">Nada com “{search.query}”.</p>
          ) : (
            sports.map((sport) => {
              const found = (search.results.data ?? []).filter(
                (team) => team.sportId === sport.id
              )
              return found.length > 0 ? (
                <fieldset key={sport.id} className="m-0 border-0 p-0">
                  <legend className="mb-2 font-bold text-sm">
                    {sport.name}
                  </legend>
                  <div className="flex flex-wrap gap-2">{found.map(chip)}</div>
                </fieldset>
              ) : null
            })
          )}
          {search.results.data ? (
            <SuggestTeam
              key={search.query}
              name={search.query}
              sports={sports}
            />
          ) : null}
        </div>
      ) : (
        sports.map((sport, index) => {
          const query = queries[index]
          const featured = new Set(query?.data?.map((team) => team.id))
          const extra = selected.filter(
            (team) => team.sportId === sport.id && !featured.has(team.id)
          )
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
              ) : query?.data?.length || extra.length ? (
                <div className="space-y-3">
                  {extra.length ? (
                    <div className="flex flex-wrap gap-2">
                      {extra.map(chip)}
                    </div>
                  ) : null}
                  {groupTeamsByKind(query?.data ?? []).map((group) => (
                    <TeamGroup key={group.label} label={group.label}>
                      {group.teams.map(chip)}
                    </TeamGroup>
                  ))}
                </div>
              ) : (
                <p className="text-xs opacity-70">Busque pelo nome acima.</p>
              )}
            </fieldset>
          )
        })
      )}
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
