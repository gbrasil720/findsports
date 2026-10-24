import { SEARCH_RADIUS_MAX_KM } from '@findsports_oficial/db/search-radius'
import { Skeleton } from '@findsports_oficial/ui/components/skeleton'
import { useState } from 'react'
import Basketball from 'reicon-react/icons/Basketball'
import ChevronRight from 'reicon-react/icons/ChevronRight'
import Football from 'reicon-react/icons/Football'
import Location from 'reicon-react/icons/Location'
import Store from 'reicon-react/icons/Store'
import { OnsideMap } from '@/components/app/onside-map'
import {
  type DiscoveryBar,
  type DiscoveryResultState,
  toMapBars
} from '@/domain/dashboard-selectors'
import {
  type Coordinates,
  type LocationState,
  type RadiusKm,
  SAO_PAULO_CITY,
  type SearchCity
} from '@/domain/discovery'
import { BarCard } from './bar-card'
import { BarResultsHeader } from './bar-results-header'

export type SuggestionKind = 'brasileirao' | 'nba' | 'region'

type Props = {
  resultState: DiscoveryResultState
  bars: DiscoveryBar[]
  radiusKm: RadiusKm
  hasActiveFilters: boolean
  locationState: LocationState
  coords: Coordinates | null
  /** A cidade que o torcedor informou; sem ela a busca cai em São Paulo. */
  profileCity: SearchCity | null
  favoriteIds: ReadonlySet<string>
  favoritePending: boolean
  classicPlacementGuaranteed: boolean
  onFavorite: (barId: string) => void
  onRequestLocation: () => void
  onRadiusChange: (radiusKm: RadiusKm) => void
  onReset: () => void
  onRetry: () => void
  retryable: boolean
  onSuggestion: (kind: SuggestionKind) => void
  onSelectMapBar: (barId: string) => void
}

/**
 * Um estado vazio só (WEB-287). Sem localização ele era outra tela, com outro
 * texto, e ainda trocava de volta assim que um filtro entrava.
 */
function EmptyResults({
  radiusKm,
  needsLocation,
  hasActiveFilters,
  profileCity,
  onRadiusChange,
  onRequestLocation,
  onReset
}: Pick<
  Props,
  | 'radiusKm'
  | 'hasActiveFilters'
  | 'profileCity'
  | 'onRadiusChange'
  | 'onRequestLocation'
  | 'onReset'
> & { needsLocation: boolean }) {
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
        Nenhum bar em até {radiusKm} km
        {hasActiveFilters ? ' transmitindo o que você busca' : ''}.
      </p>
      {needsLocation ? (
        <>
          <p className="mx-auto mt-2 max-w-xs text-[var(--onside-muted)] text-xs leading-snug">
            Sem a sua localização, a busca parte do centro de{' '}
            {(profileCity ?? SAO_PAULO_CITY).name}.
          </p>
          <button
            type="button"
            onClick={onRequestLocation}
            className="onside-btn onside-btn-acid mt-5"
          >
            <Location size={14} color="currentColor" aria-hidden="true" />
            Usar minha localização
          </button>
        </>
      ) : radiusKm < SEARCH_RADIUS_MAX_KM ? (
        // O dobro, até o teto: de 3 vai a 6, de 30 vai a 50.
        <button
          type="button"
          onClick={() =>
            onRadiusChange(Math.min(radiusKm * 2, SEARCH_RADIUS_MAX_KM))
          }
          className="onside-btn onside-btn-acid mt-5"
        >
          Buscar em {Math.min(radiusKm * 2, SEARCH_RADIUS_MAX_KM)} km →
        </button>
      ) : null}
      {/* Sem filtro ligado não há o que limpar. */}
      {hasActiveFilters ? (
        <button
          type="button"
          onClick={onReset}
          className="mt-3 block w-full font-bold text-[var(--onside-live-text)] text-sm hover:underline"
        >
          Limpar filtros
        </button>
      ) : null}
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
      <p className="onside-kicker">Talvez você queira experimentar</p>
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
              className="shrink-0 text-[var(--onside-muted)]"
              aria-hidden="true"
            />
          </button>
        ))}
      </div>
    </div>
  )
}

function ResultsSkeleton() {
  return (
    <div
      className="space-y-3"
      role="status"
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">Buscando bares…</span>
      {[1, 2, 3].map((item) => (
        <div
          key={item}
          className="grid min-h-[104px] grid-cols-[auto_1fr_auto] items-center gap-3 border-[1.5px] border-[var(--onside-ink)] bg-[var(--onside-paper)] p-4 sm:gap-4"
        >
          <div className="col-span-2 grid min-w-0 grid-cols-[auto_1fr] items-center gap-3 sm:gap-4">
            <Skeleton className="size-16 shrink-0" />
            <div className="min-w-0 space-y-2">
              <Skeleton className="h-3 w-28 max-w-full" />
              <Skeleton className="h-5 w-40 max-w-full" />
              <div className="flex gap-3">
                <Skeleton className="h-3 w-14" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
          </div>
          <Skeleton className="col-start-3 row-start-1 size-11 shrink-0" />
        </div>
      ))}
    </div>
  )
}

type HoverProps = {
  hoveredId: string | null
  onHover: (barId: string | null) => void
}

function ResultContent(props: Props & HoverProps) {
  const { resultState } = props

  if (resultState.status === 'loading') {
    return <ResultsSkeleton />
  }

  if (resultState.status === 'error') {
    return (
      <div className="onside-callout onside-callout-danger" role="alert">
        <p className="text-sm">
          Não foi possível carregar os bares. Tente novamente.
        </p>
        {props.retryable ? (
          <button
            type="button"
            onClick={props.onRetry}
            className="font-bold text-sm underline underline-offset-2"
          >
            Tentar de novo
          </button>
        ) : null}
      </div>
    )
  }

  if (resultState.status !== 'ready' || props.bars.length === 0) {
    return (
      <EmptyResults
        radiusKm={props.radiusKm}
        needsLocation={resultState.status === 'location-required'}
        hasActiveFilters={props.hasActiveFilters}
        profileCity={props.profileCity}
        onRadiusChange={props.onRadiusChange}
        onRequestLocation={props.onRequestLocation}
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
      classicPlacementGuaranteed={props.classicPlacementGuaranteed}
      onHover={props.onHover}
      onFavorite={props.onFavorite}
    />
  ))
}

export function DashboardResults(props: Props) {
  const {
    resultState,
    bars,
    coords,
    profileCity,
    locationState,
    radiusKm,
    onSelectMapBar
  } = props
  // O destaque do hover mora aqui, e não na rota: trocar de card renderiza
  // a lista e o mapa, não a página com os filtros.
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  // Calculado a cada render daqui, e não na rota: o pino passa a "ao vivo"
  // pela hora do render, e o hover (que não renderiza mais a rota) redesenha.
  const mapBars = toMapBars(bars)
  const loading = resultState.status === 'loading'
  const locationError =
    locationState === 'denied' || locationState === 'unavailable'
  const fallbackCity = profileCity ?? SAO_PAULO_CITY

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,0.42fr)_minmax(0,0.58fr)] lg:grid-rows-[auto_minmax(0,1fr)] lg:gap-x-5 lg:gap-y-0 lg:items-stretch">
      <div className="min-w-0 lg:col-start-1 lg:row-start-1">
        <BarResultsHeader count={bars.length} loading={loading} />
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
            <ResultContent
              {...props}
              hoveredId={hoveredId}
              onHover={setHoveredId}
            />
          </div>
        </section>

        {!loading ? <Suggestions onSuggestion={props.onSuggestion} /> : null}
      </div>

      <div className="flex min-h-0 min-w-0 flex-col lg:col-start-2 lg:row-start-2">
        <section className="onside-map-frame h-[280px] sm:h-[320px] lg:h-auto lg:min-h-[360px] lg:flex-1">
          <OnsideMap
            bars={mapBars}
            // Sem localização o mapa enquadra o raio em volta da cidade do
            // perfil, que é onde a busca foi feita (WEB-319).
            center={coords ?? profileCity ?? undefined}
            showUserLocation={Boolean(coords) && !locationError}
            radiusKm={radiusKm}
            hoveredId={hoveredId}
            onHover={setHoveredId}
            onSelect={onSelectMapBar}
          />
          <div className="onside-map-label pointer-events-none">
            {coords && !locationError
              ? 'Perto de você'
              : `${fallbackCity.name}, ${fallbackCity.uf}`}
          </div>
        </section>
      </div>
    </div>
  )
}
