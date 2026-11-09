import { useRouter } from 'expo-router'
import { authClient } from './auth-client'

/**
 * Ver sem conta, agir com conta (rodada 1 do redesign, como o web do
 * torcedor): o app abre no Explorar para quem não entrou. As consultas só do
 * torcedor esperam por `useFan()`; o que grava passa por `useWithAccount()`.
 */
export function useFan() {
  return authClient.useSession().data?.user.role === 'fan'
}

/**
 * Roda a ação com conta de torcedor; sem ela, leva ao "Entrar". A folha de
 * entrar com o contexto da ação é da rodada 2.
 */
export function useWithAccount() {
  const fan = useFan()
  const router = useRouter()
  return (action: () => void) => (fan ? action() : router.push('/sign-in'))
}
