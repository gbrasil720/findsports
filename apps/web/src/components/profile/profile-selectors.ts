import type { MapBar } from '@/components/app/google-map'
import type {
  CompletionItem,
  Favorite,
  FavoriteEvent,
  FavoriteSort,
  NearbyBar,
  Preference,
  ProfileUser
} from './profile-model'

export function getProfileInitials(user: ProfileUser | undefined): string {
  return (
    user?.name
      ?.split(' ')
      .map((word: string) => word[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() ?? '?'
  )
}

export function getCompletionItems(
  user: ProfileUser | undefined,
  preferences: Preference[],
  favorites: Favorite[]
): CompletionItem[] {
  return [
    { label: 'Foto de perfil', done: Boolean(user?.image) },
    { label: 'Esportes favoritos', done: preferences.length > 0 },
    { label: 'Primeiro bar favorito', done: favorites.length > 0 }
  ]
}

export function getCompletionScore(items: CompletionItem[]): number {
  return Math.round(
    (items.filter((item) => item.done).length / items.length) * 100
  )
}

export function selectUpcomingFavoriteEvents(
  favorites: Favorite[],
  limit = 5
): FavoriteEvent[] {
  return favorites
    .flatMap((favorite) =>
      favorite.bar.events.map((event) => ({ ...event, bar: favorite.bar }))
    )
    .sort(
      (first, second) =>
        new Date(first.startsAt).getTime() - new Date(second.startsAt).getTime()
    )
    .slice(0, limit)
}

export function selectNearbyUnfavoritedBars(
  bars: NearbyBar[],
  favorites: Favorite[],
  limit = 3
): NearbyBar[] {
  const favoriteIds = new Set(favorites.map((favorite) => favorite.bar.id))
  return bars.filter((bar) => !favoriteIds.has(bar.id)).slice(0, limit)
}

export function sortAndFilterFavorites(
  favorites: Favorite[],
  sortBy: FavoriteSort,
  withEventsOnly: boolean
): Favorite[] {
  const selected = withEventsOnly
    ? favorites.filter((favorite) => favorite.bar.events.length > 0)
    : [...favorites]

  return selected.sort((first, second) => {
    if (sortBy === 'az') {
      return first.bar.name.localeCompare(second.bar.name)
    }
    if (sortBy === 'city') {
      const cityOrder = first.bar.city.localeCompare(second.bar.city)
      return cityOrder || first.bar.name.localeCompare(second.bar.name)
    }

    const firstStart = first.bar.events[0]?.startsAt
    const secondStart = second.bar.events[0]?.startsAt
    if (!firstStart && !secondStart) return 0
    if (!firstStart) return 1
    if (!secondStart) return -1
    return new Date(firstStart).getTime() - new Date(secondStart).getTime()
  })
}

export function groupFavoritesByCity(
  favorites: Favorite[]
): Map<string, Favorite[]> {
  const groups = new Map<string, Favorite[]>()
  for (const favorite of favorites) {
    const current = groups.get(favorite.bar.city) ?? []
    groups.set(favorite.bar.city, [...current, favorite])
  }
  return groups
}

export function createFavoriteMapBars(favorites: Favorite[]): MapBar[] {
  return favorites.flatMap((favorite) => {
    const lat = Number.parseFloat(favorite.bar.latitude)
    const lng = Number.parseFloat(favorite.bar.longitude)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return []
    return [
      {
        id: favorite.bar.id,
        name: favorite.bar.name,
        lat,
        lng,
        accent: 'ink' as const
      }
    ]
  })
}
