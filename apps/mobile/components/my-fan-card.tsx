import { useQuery } from '@tanstack/react-query'
import { useExploreState } from '@/components/explore-state'
import { cardNumber, FanCard } from '@/components/fan-card'
import { sportMark } from '@/components/onboarding'
import { authClient } from '@/lib/auth-client'
import { crownLabel } from '@/lib/ranking'
import { trpc } from '@/lib/trpc'

/**
 * A carteirinha de quem está na conta, com o que o servidor sabe: o topo do
 * Perfil e das Preferências (rodada 6). Cada campo se edita nas Preferências.
 */
export function MyFanCard() {
  const state = useExploreState()
  const user = authClient.useSession().data?.user
  const prefs = useQuery(trpc.pubs.getMyPreferences.queryOptions())
  const teams = useQuery(trpc.pubs.getMyTeams.queryOptions())
  const city = useQuery(trpc.pubs.getMyCity.queryOptions())
  const crowns = useQuery(trpc.ranking.crowns.queryOptions())
  const crown = crowns.data?.[0]
  const since = user
    ? new Date(user.createdAt)
        .toLocaleDateString('pt-BR', {
          month: 'short',
          year: 'numeric',
          timeZone: 'America/Sao_Paulo'
        })
        .replace(' de ', ' ')
        .replace('.', '')
        .toLocaleUpperCase('pt-BR')
    : undefined
  return (
    <FanCard
      name={user?.name ?? 'Torcedor'}
      teams={(teams.data ?? [])
        .filter((team) => team.kind !== 'race')
        .map((team) => team.name)}
      sports={(prefs.data ?? []).map((pref) => sportMark(pref.sport.name))}
      radius={`${user?.searchRadiusKm ?? 3} km`}
      base={(state.device && state.district) || city.data?.name || null}
      validated
      still
      number={user ? cardNumber(user.id) : undefined}
      since={since}
      crown={crown ? crownLabel(crown.month) : undefined}
    />
  )
}
