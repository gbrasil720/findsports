import { useQuery } from '@tanstack/react-query'
import { authClient } from '@/lib/auth-client'
import { trpc } from '@/lib/trpc'

/**
 * Se dá para convidar para o Jules agora (WEB-544, WEB-548): a IA ligada
 * (`ai.enabled`, pública) e, para o torcedor, sem limite do dia nem IA fora
 * do ar (`ai.status`). O visitante vê o convite com a IA ligada: o toque pede
 * a conta. Conta de bar não é convidada (a busca com IA é do torcedor).
 * Enquanto carrega, não convida: o convite não aparece e some depois.
 */
export function useAiReady() {
  const session = authClient.useSession()
  const role = session.data?.user.role
  const config = useQuery(trpc.appConfig.getPublic.queryOptions())
  const status = useQuery({
    ...trpc.ai.status.queryOptions(),
    enabled: role === 'fan' && config.data?.['ai.enabled'] === true
  })
  if (session.isPending || config.data?.['ai.enabled'] !== true) return false
  if (!role) return true
  return role === 'fan' && status.data?.kind === 'ready'
}
