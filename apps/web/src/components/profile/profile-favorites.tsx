import { Link } from '@tanstack/react-router'
import ArrowRight from 'reicon-react/icons/ArrowRight'
import Heart from 'reicon-react/icons/Heart'
import List from 'reicon-react/icons/List'
import Loader from 'reicon-react/icons/Loader'
import Location from 'reicon-react/icons/Location'
import Sort from 'reicon-react/icons/Sort'
import { GoogleMap, type MapBar } from '@/components/app/google-map'
import type { Coordinates } from '@/domain/discovery'
import { FavoriteCard } from './favorite-card'
import type { Favorite, FavoriteSort, FavoriteView } from './profile-model'

type Props = {
  favorites: Favorite[]
  sortedFavorites: Favorite[]
  favoritesByCity: Map<string, Favorite[]> | null
  mapBars: MapBar[]
  coords: Coordinates | null
  loading: boolean
  sortBy: FavoriteSort
  viewMode: FavoriteView
  filterWithEvents: boolean
  hoveredBarId: string | null
  unfavoritePending: boolean
  onSortChange: (sort: FavoriteSort) => void
  onViewModeChange: (view: FavoriteView) => void
  onToggleEventsFilter: () => void
  onHoverBar: (barId: string | null) => void
  onSelectBar: (barId: string) => void
  onUnfavorite: (barId: string) => void
}

const SORT_OPTIONS: { value: FavoriteSort; label: string }[] = [
  { value: 'upcoming', label: 'Próximos jogos' },
  { value: 'az', label: 'A–Z' },
  { value: 'city', label: 'Cidade' }
]

export function ProfileFavorites(props: Props) {
  const {
    favorites,
    sortedFavorites,
    favoritesByCity,
    mapBars,
    coords,
    loading,
    sortBy,
    viewMode,
    filterWithEvents,
    hoveredBarId,
    unfavoritePending
  } = props

  return (
    <div className="space-y-4">
      {favorites.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-none border border-[var(--onside-ink)] bg-[var(--onside-paper)] p-1">
            <Sort
              size={14}
              color="currentColor"
              className="ml-2 text-[var(--onside-muted)]"
            />
            {SORT_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => props.onSortChange(option.value)}
                className={`rounded-none px-3 py-1.5 font-bold text-xs transition-colors ${
                  sortBy === option.value
                    ? 'bg-[var(--onside-ink)] text-[var(--onside-paper)]'
                    : 'text-[var(--onside-muted)] hover:text-[var(--onside-ink)]'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={props.onToggleEventsFilter}
            className={`min-h-11 rounded-none px-3 py-2 font-bold text-xs ring-1 transition-colors ${
              filterWithEvents
                ? 'bg-[var(--onside-acid)] text-[var(--onside-ink)] ring-transparent'
                : 'bg-[var(--onside-paper)] text-[var(--onside-muted)] ring-[var(--onside-line)] hover:text-[var(--onside-ink)]'
            }`}
          >
            Com jogos
          </button>

          <div className="ml-auto flex items-center gap-1 rounded-none border border-[var(--onside-ink)] bg-[var(--onside-paper)] p-1">
            <button
              type="button"
              onClick={() => props.onViewModeChange('list')}
              className={`grid min-h-11 min-w-11 place-items-center rounded-none transition-colors ${
                viewMode === 'list'
                  ? 'bg-[var(--onside-ink)] text-[var(--onside-paper)]'
                  : 'text-[var(--onside-muted)] hover:text-[var(--onside-ink)]'
              }`}
              aria-label="Visualização em lista"
              aria-pressed={viewMode === 'list'}
            >
              <List size={14} color="currentColor" />
            </button>
            <button
              type="button"
              onClick={() => props.onViewModeChange('map')}
              className={`grid min-h-11 min-w-11 place-items-center rounded-none transition-colors ${
                viewMode === 'map'
                  ? 'bg-[var(--onside-ink)] text-[var(--onside-paper)]'
                  : 'text-[var(--onside-muted)] hover:text-[var(--onside-ink)]'
              }`}
              aria-label="Visualização no mapa"
              aria-pressed={viewMode === 'map'}
            >
              <Location size={14} color="currentColor" />
            </button>
          </div>
        </div>
      ) : null}

      {loading ? (
        <div className="flex justify-center py-12 text-[var(--onside-muted)]">
          <Loader size={24} color="currentColor" className="animate-spin" />
        </div>
      ) : null}

      {!loading && favorites.length === 0 ? <EmptyFavorites /> : null}

      {!loading && favorites.length > 0 && sortedFavorites.length === 0 ? (
        <section className="rounded-none border border-[var(--onside-ink)] bg-[var(--onside-paper)] p-6 text-center">
          <p className="text-[var(--onside-muted)] text-sm">
            Nenhum bar favorito com jogos agendados no momento.
          </p>
        </section>
      ) : null}

      {!loading && viewMode === 'map' && sortedFavorites.length > 0 ? (
        <div className="relative h-[420px] overflow-hidden rounded-none border border-[var(--onside-ink)] md:h-[520px]">
          <GoogleMap
            bars={mapBars}
            center={coords ?? undefined}
            hoveredId={hoveredBarId}
            onHover={props.onHoverBar}
            onSelect={props.onSelectBar}
          />
          <div className="absolute bottom-3 left-3 rounded-none border border-[var(--onside-ink)] bg-[var(--onside-paper)]/90 px-3 py-1.5 font-bold text-xs backdrop-blur">
            {sortedFavorites.length} bar
            {sortedFavorites.length !== 1 ? 'es' : ''} favorito
            {sortedFavorites.length !== 1 ? 's' : ''}
          </div>
        </div>
      ) : null}

      {!loading && viewMode === 'list' && sortedFavorites.length > 0 ? (
        favoritesByCity ? (
          Array.from(favoritesByCity.entries()).map(([city, cityFavorites]) => (
            <div key={city}>
              <div className="mb-2 flex items-center gap-2 px-1">
                <Location
                  size={13}
                  color="currentColor"
                  className="text-[var(--onside-muted)]"
                />
                <span className="font-bold text-[var(--onside-muted)] text-xs uppercase tracking-widest">
                  {city}
                </span>
              </div>
              <FavoriteGrid
                favorites={cityFavorites}
                pending={unfavoritePending}
                onUnfavorite={props.onUnfavorite}
              />
            </div>
          ))
        ) : (
          <FavoriteGrid
            favorites={sortedFavorites}
            pending={unfavoritePending}
            onUnfavorite={props.onUnfavorite}
          />
        )
      ) : null}
    </div>
  )
}

function FavoriteGrid({
  favorites,
  pending,
  onUnfavorite
}: {
  favorites: Favorite[]
  pending: boolean
  onUnfavorite: (barId: string) => void
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {favorites.map((favorite) => (
        <FavoriteCard
          key={favorite.bar.id}
          favorite={favorite}
          onUnfavorite={() => onUnfavorite(favorite.bar.id)}
          isPending={pending}
        />
      ))}
    </div>
  )
}

function EmptyFavorites() {
  return (
    <section className="rounded-none border border-[var(--onside-ink)] bg-[var(--onside-paper)] p-8 text-center">
      <Heart
        size={36}
        color="currentColor"
        className="mx-auto mb-3 text-[var(--onside-muted)]"
      />
      <p className="mb-1 font-bold text-[var(--onside-ink)] text-sm">
        Nenhum bar favoritado
      </p>
      <p className="mb-4 text-[var(--onside-muted)] text-xs">
        Explore bares e favorite os seus preferidos.
      </p>
      <Link
        to="/dashboard"
        className="inline-flex items-center gap-1.5 font-bold text-[var(--onside-live-text)] text-sm hover:underline"
      >
        Explorar bares <ArrowRight size={14} color="currentColor" />
      </Link>
    </section>
  )
}
