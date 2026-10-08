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

/**
 * Slug estável por aba. O rótulo é texto de tela e muda; `id`, `aria-controls`
 * e `aria-labelledby` precisam de algo que não mude junto — e que não carregue
 * acento nem espaço para dentro de um atributo de id.
 */
export const PROFILE_TAB_SLUGS: Record<ProfileTab, string> = {
  'Visão geral': 'visao-geral',
  Favoritos: 'favoritos',
  Configurações: 'configuracoes'
}

/**
 * A aba mora no hash da URL, como no painel do bar: sobrevive a recarregar e
 * dá para mandar o link (WEB-293). O hash é o slug, e não o id do painel,
 * de propósito — sem elemento com esse id o navegador não rola a página.
 */
export function profileTabHash(tab: ProfileTab): string {
  return `#${PROFILE_TAB_SLUGS[tab]}`
}

export function getProfileTabFromHash(hash: string): ProfileTab | null {
  return PROFILE_TABS.find((tab) => profileTabHash(tab) === hash) ?? null
}

export function profileTabId(tab: ProfileTab): string {
  return `perfil-${PROFILE_TAB_SLUGS[tab]}-tab`
}

export function profileTabPanelId(tab: ProfileTab): string {
  return `perfil-${PROFILE_TAB_SLUGS[tab]}`
}
export type FavoriteSort = 'upcoming' | 'az' | 'city'
export type FavoriteView = 'list' | 'map'
export type ProfileUser = NonNullable<SessionResult['data']>['user']
export type Favorite = RouterOutputs['pubs']['getFavorites'][number]
export type FavoriteEvent = Favorite['bar']['events'][number] & {
  bar: Favorite['bar']
}
export type Preference = RouterOutputs['pubs']['getMyPreferences'][number]
export type Sport = RouterOutputs['pubs']['getSports'][number]
export type RecommendationResult = RouterOutputs['recommendations']['get']
export type BarRecommendation = RecommendationResult['recommendations'][number]

export type CompletionItem = { label: string; done: boolean }
