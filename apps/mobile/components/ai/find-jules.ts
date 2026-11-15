import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useFan } from '@/lib/account'
import { trpc } from '@/lib/trpc'

/**
 * "Achou o Jules" (WEB-558): o primeiro toque no Jules parado grava a
 * conquista secreta. Sendo nova, a leitura das conquistas é refeita e o
 * `useNewAchievement` abre a conquista desbloqueada (2k). Uma vez por sessão
 * do app basta: o servidor ignora as seguintes.
 */
let pedido = false

export function useFindJules() {
  const fan = useFan()
  const queryClient = useQueryClient()
  const find = useMutation(
    trpc.achievements.findJules.mutationOptions({
      onSuccess: ({ isNew }) => {
        if (isNew)
          void queryClient.invalidateQueries({
            queryKey: trpc.achievements.mine.queryKey()
          })
      },
      onError: () => {
        pedido = false
      }
    })
  )
  return () => {
    if (!fan || pedido) return
    pedido = true
    find.mutate({ via: 'app' })
  }
}
