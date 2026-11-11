import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useId } from 'react'
import { toast } from 'sonner'
import { Check, Close } from '@/components/landing/v3/icons'
import {
  type FavoriteTeam,
  useTeamSearch
} from '@/components/sports/team-picker'
import { CATALOG_QUERY } from '@/lib/query-cache'
import { getUserFacingMessage } from '@/lib/user-facing-error'
import { useTRPC } from '@/utils/trpc'

/*
 * "Times da casa" (WEB-433): opcional, até cinco. Pesam nos jogos da semana
 * pra você e dão o "Seu time" no card. A busca é a do torcedor
 * (`pubs.searchTeams`), em todos os esportes. Serve ao Meu espaço (grava na
 * hora) e à rotina do cadastro (vai no `completePub`).
 */

/** O teto do servidor (`HOUSE_TEAMS_MAX`; o módulo dele puxa o banco). */
export const TIMES_DA_CASA_MAX = 5

export function EscolhaTimesDaCasa({
  value,
  onChange,
  disabled
}: {
  value: FavoriteTeam[]
  onChange: (value: FavoriteTeam[]) => void
  disabled?: boolean
}) {
  const trpc = useTRPC()
  const id = useId()
  const sports = useQuery({
    ...trpc.pubs.getSports.queryOptions(),
    ...CATALOG_QUERY,
    meta: { errorToast: false }
  })
  const search = useTeamSearch((sports.data ?? []).map((s) => s.id))
  const cheio = value.length >= TIMES_DA_CASA_MAX
  const achados = (search.results.data ?? [])
    .filter((t) => !value.some((v) => v.id === t.id))
    .slice(0, 8)

  return (
    <div className="tdc">
      {value.length ? (
        <ul className="tdc-l" aria-label="Times da casa">
          {value.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                className="tdc-chip is-on"
                disabled={disabled}
                aria-label={`Tirar ${t.name}`}
                onClick={() => onChange(value.filter((v) => v.id !== t.id))}
              >
                <Check size={14} />
                {t.name}
                <Close size={14} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {cheio ? (
        <p className="tdc-note">
          Até {TIMES_DA_CASA_MAX} times. Tire um para trocar.
        </p>
      ) : (
        <>
          <label htmlFor={id} className="sr-only">
            Buscar time
          </label>
          <input
            id={id}
            className="tdc-q"
            type="text"
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            maxLength={60}
            placeholder="Buscar time: Palmeiras, Flamengo…"
            value={search.text}
            disabled={disabled}
            onChange={(e) => search.setText(e.target.value)}
          />
          {search.active && achados.length ? (
            <ul className="tdc-l" aria-label="Times achados">
              {achados.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    className="tdc-chip"
                    disabled={disabled}
                    onClick={() => {
                      onChange([
                        ...value,
                        { id: t.id, name: t.name, sportId: t.sportId }
                      ])
                      search.setText('')
                    }}
                  >
                    {t.name}
                  </button>
                </li>
              ))}
            </ul>
          ) : search.active && search.results.isFetched ? (
            <p className="tdc-note">Nenhum time com esse nome.</p>
          ) : null}
        </>
      )}
    </div>
  )
}

/** O card do Meu espaço: cada troca grava na hora. */
export function TimesDaCasa() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const times = useQuery({
    ...trpc.pub.getMyHouseTeams.queryOptions(),
    meta: { errorToast: false }
  })
  const salvar = useMutation(
    trpc.pub.updateHouseTeams.mutationOptions({ meta: { errorToast: false } })
  )
  const mudar = async (value: FavoriteTeam[]) => {
    const key = trpc.pub.getMyHouseTeams.queryKey()
    const antes = times.data
    queryClient.setQueryData(key, value)
    try {
      await salvar.mutateAsync({ teamIds: value.map((t) => t.id) })
      await queryClient.invalidateQueries({
        queryKey: trpc.pub.gameSuggestions.queryKey()
      })
    } catch (error) {
      queryClient.setQueryData(key, antes)
      toast.error(
        getUserFacingMessage(
          error,
          'Não deu para salvar os times da casa. Tente de novo.'
        )
      )
    }
  }
  return (
    <section className="pn-card pn-sec2" aria-labelledby="esp-tdc">
      <div className="pn-chd">
        <h3 id="esp-tdc">Times da casa</h3>
        <small>opcional</small>
      </div>
      <p className="pn-note">
        O bar é a casa de algum time? Os jogos dele vêm primeiro nos jogos da
        semana, com a etiqueta “Seu time”. O torcedor não vê esta lista.
      </p>
      {times.isError ? (
        <p className="pn-block">Não deu para carregar os times da casa.</p>
      ) : (
        <EscolhaTimesDaCasa
          value={times.data ?? []}
          onChange={(value) => void mudar(value)}
          disabled={times.isPending}
        />
      )}
    </section>
  )
}
