import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useRef } from 'react'
import { trpc } from './trpc'

/**
 * Favoritos do torcedor, com a troca otimista: o coração muda no toque (junto
 * com o háptico), não depois de duas idas ao servidor; se o servidor recusar,
 * volta como estava. A lista certa vem no refetch do fim.
 */
export function useFavorites() {
  const queryClient = useQueryClient()
  const favorites = useQuery(trpc.pubs.getFavorites.queryOptions())
  const key = trpc.pubs.getFavorites.queryKey()
  type List = NonNullable<typeof favorites.data>

  // A lista de antes da troca, para desfazer se o servidor recusar.
  const before = useRef<List | undefined>(undefined)
  const swap = async (barId: string, add: boolean) => {
    await queryClient.cancelQueries({ queryKey: key })
    before.current = queryClient.getQueryData<List>(key)
    queryClient.setQueryData<List>(key, (list = []) =>
      add
        ? [...list, { barId } as List[number]]
        : list.filter((item) => item.barId !== barId)
    )
  }
  const undo = () => queryClient.setQueryData(key, before.current)
  const refresh = () => queryClient.invalidateQueries({ queryKey: key })
  const add = useMutation(
    trpc.pubs.favorite.mutationOptions({
      onMutate: ({ barId }) => swap(barId, true),
      onError: undo,
      onSettled: refresh
    })
  )
  const remove = useMutation(
    trpc.pubs.unfavorite.mutationOptions({
      onMutate: ({ barId }) => swap(barId, false),
      onError: undo,
      onSettled: refresh
    })
  )

  const ids = useMemo(
    () => new Set(favorites.data?.map((item) => item.barId)),
    [favorites.data]
  )
  return {
    ids,
    count: favorites.data?.length ?? 0,
    toggle: (barId: string) =>
      ids.has(barId) ? remove.mutate({ barId }) : add.mutate({ barId })
  }
}
