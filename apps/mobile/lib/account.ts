import { useRouter, useSegments } from 'expo-router'
import { useEffect } from 'react'
import { Alert } from 'react-native'
import { accountKind, leavesRoute } from './account-role'
import {
  authClient,
  readStoredRole,
  useAccountWithoutData
} from './auth-client'
import { type Acao, savePending } from './pending-action'

/**
 * Ver sem conta, agir com conta (rodadas 1 e 2 do redesign, como o web do
 * torcedor): o app abre no Explorar para quem não entrou. As consultas só do
 * torcedor esperam por `useFan()`; o que grava passa por `useWithAccount()`.
 */
export function useFan() {
  return useAccountKind() === 'fan'
}

/**
 * Torcedor, bar ou nenhum. Com a sessão, o papel dela; na conta no aparelho
 * sem resposta do servidor (WEB-538), o da última sessão boa, guardado: o
 * torcedor segue como conta (as leituras rodam e caem no erro de cada tela,
 * nada chama para entrar) e o bar não vira torcedor. Regra em
 * `lib/account-role.ts`.
 */
export function useAccountKind() {
  const role = authClient.useSession().data?.user.role
  const withoutData = useAccountWithoutData()
  return accountKind(role, withoutData ? readStoredRole() : null, withoutData)
}

/**
 * A conta sem dados abriu uma tela que não é do papel dela (link direto,
 * recarga): volta à abertura, que mostra o "Sinal caiu" e leva à área certa
 * quando a sessão chegar. Montado uma vez, na raiz.
 */
export function useOfflineRouteGuard() {
  const kind = useAccountKind()
  const withoutData = useAccountWithoutData()
  const segment = useSegments()[0]
  const router = useRouter()
  const leave = leavesRoute(kind, withoutData, segment)
  useEffect(() => {
    if (leave) router.replace('/')
  }, [leave, router])
}

/**
 * Roda a ação com conta de torcedor; sem ela, abre a folha de entrar com o
 * contexto (o bar, o jogo, o que pedia conta) e guarda a ação, que sai feita
 * quando a conta existir (`lib/pending-action.ts`).
 */
export function useWithAccount() {
  const fan = useFan()
  const offline = useAccountWithoutData()
  const router = useRouter()
  return (action: () => void, acao: Acao = { kind: 'conta', what: '' }) => {
    // A conta está no aparelho, só o servidor não respondeu (WEB-538): pedir
    // para entrar diria que ela saiu.
    if (offline)
      return Alert.alert(
        'Sem conexão',
        'Sua conta continua aqui. Tente de novo quando a rede voltar.'
      )
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
