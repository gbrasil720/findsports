import {
  idempotentMutationKeys,
  retryDelay,
  retryTransient
} from '@findsports_oficial/api/lib/transient-error'
import {
  focusManager,
  MutationCache,
  onlineManager,
  QueryClient
} from '@tanstack/react-query'
import * as Network from 'expo-network'
import { AppState } from 'react-native'

/**
 * Por 30 s a resposta vale como está: trocar de tela não repete a mesma
 * consulta (`pubs.getMyCity` aparece em uma dúzia de telas). Os dados que
 * quase não mudam ganham mais tempo em `lib/trpc.ts`. Só a falha passageira
 * (rede, timeout, 5xx) tenta de novo, com espera crescente: recusa do
 * servidor aparece na hora (WEB-460, a mesma regra do web).
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: retryTransient, retryDelay }
  },
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

// Mutation só repete sozinha quando mandar duas vezes dá no mesmo
// (WEB-460); as outras voltam ao botão, com o que a pessoa escolheu.
for (const mutationKey of idempotentMutationKeys())
  queryClient.setMutationDefaults(mutationKey, {
    retry: retryTransient,
    retryDelay
  })

// Voltar do segundo plano conta como foco: o que passou do `staleTime` e está
// na tela é buscado de novo. Sem rede, as consultas esperam ela voltar.
focusManager.setEventListener((setFocused) => {
  const sub = AppState.addEventListener('change', (state) =>
    setFocused(state === 'active')
  )
  return () => sub.remove()
})
onlineManager.setEventListener((setOnline) => {
  const sub = Network.addNetworkStateListener((state) =>
    setOnline(state.isConnected !== false)
  )
  return () => sub.remove()
})
// A rede voltou (WEB-460): a tela à vista é relida inteira, e a pílula de
// "Sem conexão" (`components/offline-banner.tsx`) some.
onlineManager.subscribe((online) => {
  if (online) queryClient.invalidateQueries()
})
