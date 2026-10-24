import { MutationCache, QueryClient } from '@tanstack/react-query'

/**
 * Por 30 s a resposta vale como está: trocar de tela não repete a mesma
 * consulta (`pubs.getMyCity` aparece em uma dúzia de telas).
 */
export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000 } },
  mutationCache: new MutationCache({
    // Toda mutation que dá certo vence o cache inteiro, sem buscar nada na
    // hora: a próxima tela que abrir busca de novo, como antes do
    // `staleTime`. A tela à vista continua contando com o próprio
    // `invalidateQueries` para atualizar já.
    onSuccess: () => {
      queryClient.invalidateQueries({ refetchType: 'none' })
    }
  })
})
