import Basketball from 'reicon-react/icons/Basketball'
import ChevronRight from 'reicon-react/icons/ChevronRight'
import Football from 'reicon-react/icons/Football'
import Loader from 'reicon-react/icons/Loader'
import Location from 'reicon-react/icons/Location'
import LocationSlash from 'reicon-react/icons/LocationSlash'
import Store from 'reicon-react/icons/Store'
import { GoogleMap, type MapBar } from '@/components/app/google-map'
import type {
  DiscoveryBar,
  DiscoveryResultState
} from '@/domain/dashboard-selectors'
import type { Coordinates, LocationState, RadiusKm } from '@/domain/discovery'
import { BarCard } from './bar-card'
import { BarResultsHeader } from './bar-results-header'

export type SuggestionKind = 'brasileirao' | 'nba' | 'region'

type Props = {
  resultState: DiscoveryResultState
  bars: DiscoveryBar[]
  mapBars: MapBar[]
  radiusKm: RadiusKm
  hasActiveFilters: boolean
  locationState: LocationState
  coords: Coordinates | null
  hoveredId: string | null
  favoriteIds: ReadonlySet<string>
  favoritePending: boolean
  onHover: (barId: string | null) => void
  onFavorite: (barId: string) => void
  onRequestLocation: () => void
  onRadiusChange: (radiusKm: RadiusKm) => void
  onReset: () => void
  onRetry: () => void
  onSuggestion: (kind: SuggestionKind) => void
  onSelectMapBar: (barId: string) => void
}

function EmptyResults({
  radiusKm,
  onRadiusChange,
  onReset
}: Pick<Props, 'radiusKm' | 'onRadiusChange' | 'onReset'>) {
  return (
    <div className="border-[1.5px] border-[var(--onside-ink)] bg-[var(--onside-paper)] px-6 py-10 text-center">
      <div className="relative mx-auto mb-4 grid size-14 place-items-center rounded-full border-[1.5px] border-[var(--onside-ink)] bg-[var(--onside-stone)] text-[var(--onside-muted)]">
        <Store size={24} color="currentColor" aria-hidden="true" />
        <span
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
          aria-hidden="true"
        >
          <span className="block h-px w-10 rotate-[-35deg] bg-[var(--onside-live)]" />
        </span>
      </div>
      <p className="mx-auto max-w-[16rem] font-semibold text-[var(--onside-ink)] text-sm leading-snug">
        Nenhum bar em até {radiusKm} km transmitindo o que você busca.
      </p>
      {radiusKm < 10 ? (
        <button
          type="button"
          onClick={() => onRadiusChange(10)}
          className="onside-btn onside-btn-acid mt-5 min-h-11 px-5 text-xs"
        >
          Buscar em 10 km →
        </button>
      ) : null}
      <button
        type="button"
        onClick={onReset}
        className="mt-3 block w-full font-bold text-[var(--onside-live-text)] text-sm hover:underline"
      >
        Remover filtros
      </button>
    </div>
  )
}

function LocationRequired({
  onRequestLocation
}: Pick<Props, 'onRequestLocation'>) {
  return (
    <div className="border-[1.5px] border-[var(--onside-ink)] bg-[var(--onside-paper)] px-6 py-12 text-center">
      <div className="mx-auto mb-4 grid size-14 place-items-center rounded-full border-[1.5px] border-[var(--onside-ink)] bg-[var(--onside-stone)] text-[var(--onside-muted)]">
        <LocationSlash size={28} color="currentColor" aria-hidden="true" />
      </div>
      <p className="mx-auto max-w-xs font-semibold text-[var(--onside-ink)] text-sm leading-snug">
        Compartilhe sua localização para ver bares perto de você
      </p>
      <button
        type="button"
        onClick={onRequestLocation}
        className="onside-btn onside-btn-acid mt-5 min-h-11 px-5 text-xs"
      >
        <Location size={14} color="currentColor" aria-hidden="true" />
        Usar minha localização
      </button>
    </div>
  )
}

function Suggestions({ onSuggestion }: Pick<Props, 'onSuggestion'>) {
  const suggestions = [
    {
      kind: 'brasileirao' as const,
      label: 'Bares transmitindo Brasileirão hoje',
      Icon: Football
    },
    {
      kind: 'nba' as const,
      label: 'Bares com jogo de NBA ao vivo',
      Icon: Basketball
    },
    {
      kind: 'region' as const,
      label: 'Bares populares na sua região',
      Icon: Store
    }
  ]

  return (
    <div className="min-w-0">
      <p className="onside-kicker mb-2.5">Talvez você queira experimentar</p>
      <div className="flex flex-col gap-2">
        {suggestions.map(({ kind, label, Icon }) => (
          <button
            key={kind}
            type="button"
            onClick={() => onSuggestion(kind)}
            className="flex min-h-12 w-full items-center gap-3 border-[1.5px] border-[var(--onside-ink)] bg-[var(--onside-paper)] px-3.5 text-left transition-colors hover:bg-[var(--onside-stone)]"
          >
            <Icon
              size={16}
              color="currentColor"
              className="shrink-0 text-[var(--onside-ink)]"
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1 font-medium text-[var(--onside-ink)] text-sm">
              {label}
            </span>
            <ChevronRight
              size={16}
              color="currentColor"
              className="shrink-0 text-[var(--onside-muted)]"
              aria-hidden="true"
            />
          </button>
        ))}
      </div>
    </div>
  )
}

function ResultContent(props: Props) {
  const { resultState } = props

  if (resultState.status === 'loading') {
    return (
      <div
        className="flex items-center justify-center border-[1.5px] border-[var(--onside-ink)] bg-[var(--onside-paper)] py-16 text-[var(--onside-muted)]"
        aria-live="polite"
      >
        <Loader
          size={24}
          color="currentColor"
          className="mr-2 animate-spin"
          aria-hidden="true"
        />
        <span className="text-sm">Buscando bares...</span>
      </div>
    )
  }

  if (resultState.status === 'error') {
    return (
      <div className="onside-callout onside-callout-danger" role="alert">
        <p className="text-sm">
          Não foi possível carregar os bares. Tente novamente.
        </p>
        <button
          type="button"
          onClick={props.onRetry}
          className="font-bold text-sm underline underline-offset-2"
        >
          Tentar de novo
        </button>
      </div>
    )
  }

  if (resultState.status === 'location-required' && !props.hasActiveFilters) {
    return <LocationRequired onRequestLocation={props.onRequestLocation} />
  }

  if (resultState.status === 'empty' || props.bars.length === 0) {
    return (
      <EmptyResults
        radiusKm={props.radiusKm}
        onRadiusChange={props.onRadiusChange}
        onReset={props.onReset}
      />
    )
  }

  return props.bars.map((bar) => (
    <BarCard
      key={bar.id}
      bar={bar}
      isHovered={props.hoveredId === bar.id}
      isFavorite={props.favoriteIds.has(bar.id)}
      favoritePending={props.favoritePending}
      onMouseEnter={() => props.onHover(bar.id)}
      onMouseLeave={() => props.onHover(null)}
      onFocus={() => props.onHover(bar.id)}
      onBlur={() => props.onHover(null)}
      onFavorite={props.onFavorite}
    />
  ))
}

export function DashboardResults(props: Props) {
  const {
    resultState,
    bars,
    mapBars,
    coords,
    locationState,
    radiusKm,
    hoveredId,
    onHover,
    onSelectMapBar
  } = props
  const loading = resultState.status === 'loading'
  const locationError =
    locationState === 'denied' || locationState === 'unavailable'

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,0.42fr)_minmax(0,0.58fr)] lg:grid-rows-[auto_minmax(0,1fr)] lg:gap-x-5 lg:gap-y-0 lg:items-stretch">
      <div className="min-w-0 lg:col-start-1 lg:row-start-1">
        <BarResultsHeader count={bars.length} />
      </div>

      <div className="flex min-w-0 flex-col gap-6 lg:col-start-1 lg:row-start-2">
        <section className="min-w-0">
          {resultState.status === 'ready' &&
          resultState.fallback &&
          bars.length > 0 ? (
            <p className="mb-3 text-[var(--onside-muted)] text-xs">
              Nenhum evento programado na região. Mostrando todos os bares
              próximos.
            </p>
          ) : null}
          <div className="space-y-3">
            <ResultContent {...props} />
          </div>
        </section>

        {!loading ? <Suggestions onSuggestion={props.onSuggestion} /> : null}
      </div>

      <div className="flex min-h-0 min-w-0 flex-col lg:col-start-2 lg:row-start-2">
        <section className="onside-map-frame relative h-[280px] sm:h-[320px] lg:h-auto lg:min-h-[360px] lg:flex-1">
          <GoogleMap
            bars={mapBars}
            center={coords ?? undefined}
            showUserLocation={Boolean(coords) && !locationError}
            radiusKm={radiusKm}
            hoveredId={hoveredId}
            onHover={onHover}
            onSelect={onSelectMapBar}
          />
          <div className="onside-map-label pointer-events-none">
            {coords && !locationError ? 'Perto de você' : 'São Paulo, SP'}
          </div>
        </section>
      </div>
    </div>
  )
}
