import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import Building from 'reicon-react/icons/Building'
import { toast } from 'sonner'
import {
  CityField,
  type CityFieldValue,
  cityFieldValue
} from '@/components/app/city-field'
import { useTRPC } from '@/utils/trpc'

/**
 * WEB-319: a cidade do torcedor, a mesma do onboarding. Escolher na lista já
 * salva, como os chips do raio logo abaixo.
 */
export function ProfileCity() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  // Só existe enquanto a pessoa digita; salvo, o campo volta a espelhar o
  // perfil.
  const [draft, setDraft] = useState<CityFieldValue | null>(null)

  const cityQuery = useQuery({
    ...trpc.pubs.getMyCity.queryOptions(),
    meta: { errorToast: false }
  })
  const update = useMutation(
    trpc.pubs.updateMyCity.mutationOptions({
      onSuccess: (city) => {
        queryClient.setQueryData(trpc.pubs.getMyCity.queryKey(), city)
        // As sugestões partem do mesmo centro.
        void queryClient.invalidateQueries({
          queryKey: trpc.recommendations.get.queryKey()
        })
        setDraft(null)
        toast.success('Cidade salva.')
      }
    })
  )

  return (
    <section className="rounded-none border border-[var(--onside-ink)] bg-[var(--onside-paper)] p-6">
      <h3 className="mb-1 flex items-center gap-2 font-bold text-lg">
        <Building
          size={20}
          color="currentColor"
          className="text-[var(--onside-live)]"
        />
        Sua cidade
      </h3>
      <p className="mb-4 text-[var(--onside-muted)] text-xs">
        De onde a busca parte quando o navegador não informa sua localização
      </p>
      <CityField
        value={draft ?? cityFieldValue(cityQuery.data)}
        disabled={cityQuery.isPending || update.isPending}
        label="Cidade"
        hint="Escolha na lista para salvar."
        onChange={(next) => {
          update.reset()
          setDraft(next)
          if (next.city) update.mutate(next.city)
        }}
      />
      {cityQuery.isError || update.isError ? (
        <p className="mt-2 text-[var(--onside-live-text)] text-xs" role="alert">
          {update.isError
            ? 'Não foi possível salvar a cidade. Tente de novo.'
            : 'Não foi possível carregar sua cidade. Você ainda pode escolher outra.'}
        </p>
      ) : null}
      {update.isPending ? (
        <p className="mt-2 text-[10px] text-[var(--onside-muted)]">Salvando…</p>
      ) : null}
    </section>
  )
}
