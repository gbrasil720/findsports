import type { AppRouter } from '@findsports_oficial/api/routers/index'
import type { inferRouterOutputs } from '@trpc/server'
import type { authClient } from '@/lib/auth-client'

type RouterOutputs = inferRouterOutputs<AppRouter>
type SessionResult = Awaited<ReturnType<typeof authClient.getSession>>

export const PROFILE_TABS = [
  'Visão geral',
  'Favoritos',
  'Configurações'
] as const

export type ProfileTab = (typeof PROFILE_TABS)[number]
export type FavoriteSort = 'upcoming' | 'az' | 'city'
export type FavoriteView = 'list' | 'map'
export type ProfileUser = NonNullable<SessionResult['data']>['user']
export type Favorite = RouterOutputs['pubs']['getFavorites'][number]
export type FavoriteEvent = Favorite['bar']['events'][number] & {
  bar: Favorite['bar']
}
export type Preference = RouterOutputs['pubs']['getMyPreferences'][number]
export type Sport = RouterOutputs['pubs']['getSports'][number]
export type NearbyBar = RouterOutputs['pubs']['search']['bars'][number]
export type RecommendationResult = RouterOutputs['recommendations']['get']
export type BarRecommendation = RecommendationResult['recommendations'][number]

export type CompletionItem = { label: string; done: boolean }
