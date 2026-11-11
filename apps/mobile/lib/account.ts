import { useRouter } from 'expo-router'
import { authClient } from './auth-client'
import { type Acao, savePending } from './pending-action'

/**
 * Ver sem conta, agir com conta (rodadas 1 e 2 do redesign, como o web do
 * torcedor): o app abre no Explorar para quem não entrou. As consultas só do
 * torcedor esperam por `useFan()`; o que grava passa por `useWithAccount()`.
 */
export function useFan() {
  return authClient.useSession().data?.user.role === 'fan'
}

/**
 * Roda a ação com conta de torcedor; sem ela, abre a folha de entrar com o
 * contexto (o bar, o jogo, o que pedia conta) e guarda a ação, que sai feita
 * quando a conta existir (`lib/pending-action.ts`).
 */
export function useWithAccount() {
  const fan = useFan()
  const router = useRouter()
  return (action: () => void, acao: Acao = { kind: 'conta', what: '' }) => {
    if (fan) return action()
    savePending(acao)
    router.push({
      pathname: '/entrar',
      params: {
        acao: acao.kind,
        ...('barId' in acao ? { bar: acao.barId } : {}),
        ...('eventId' in acao ? { jogo: acao.eventId } : {}),
        ...(acao.kind === 'conta' && acao.what ? { item: acao.what } : {})
      }
    })
  }
}
