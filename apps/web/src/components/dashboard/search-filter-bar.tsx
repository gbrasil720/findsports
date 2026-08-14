import { useState } from 'react'
import Crosshairs from 'reicon-react/icons/Crosshairs'
import Loader from 'reicon-react/icons/Loader'
import Search from 'reicon-react/icons/Search'
import Xmark from 'reicon-react/icons/Xmark'
import { SportIcon } from '@/components/sports/sport-icon'
import type { SportsState } from '@/domain/dashboard-selectors'
import {
  DEFAULT_RADIUS_KM,
  type LocationState,
  type RadiusKm,
  SEARCH_RADII
} from '@/domain/discovery'

const RADIUS_LABELS: Record<RadiusKm, string> = {
  1: '1 km',
  3: '3 km',
  5: '5 km',
  10: '10 km'
}

export type ActiveFilter = { label: string; clear: () => void }

type Props = {
  championship: string
  onChampionshipChange: (value: string) => void
  sportId: string | undefined
  onSportChange: (value: string | undefined) => void
  radiusKm: RadiusKm
  onRadiusChange: (value: RadiusKm) => void
  sportsState: SportsState
  activeFilters: ActiveFilter[]
  onReset: () => void
  locationState: LocationState
  onRequestLocation: () => void
}

const chipBase =
  'inline-flex min-h-11 items-center gap-2 border border-[var(--onside-ink)] px-3.5 py-2 font-bold text-xs uppercase tracking-[0.04em] transition-colors'

export function SearchFilterBar({
  championship,
  onChampionshipChange,
  sportId,
  onSportChange,
  radiusKm,
  onRadiusChange,
  sportsState,
  activeFilters,
  onReset,
  locationState,
  onRequestLocation
}: Props) {
  const [focused, setFocused] = useState(false)
  const locationBusy = locationState === 'requesting'
  const locationGranted = locationState === 'granted'

  return (
    <div className="onside-sticky-filters -mx-4 mb-6 max-h-[min(50dvh,24rem)] space-y-3 overflow-y-auto px-4 md:mx-0 md:max-h-none md:overflow-visible md:px-0">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
        <div
          className={`flex min-h-12 min-w-0 flex-1 items-center gap-3 border border-[var(--onside-ink)] bg-[var(--onside-paper)] px-3 transition-colors ${
            focused ? 'bg-[var(--onside-stone)]' : ''
          }`}
        >
          <Search
            size={18}
            color="currentColor"
            className={`shrink-0 ${focused ? 'text-[var(--onside-live)]' : 'text-[var(--onside-muted)]'}`}
            aria-hidden="true"
          />
          <label htmlFor="championship-search" className="sr-only">
            Buscar bar, time ou campeonato
          </label>
          <input
            id="championship-search"
            name="championship"
            type="search"
            value={championship}
            onChange={(event) => onChampionshipChange(event.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="Buscar bar, time ou campeonato..."
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="search"
            className="min-h-11 min-w-0 flex-1 bg-transparent font-medium text-[var(--onside-ink)] text-base outline-none placeholder:text-[var(--onside-muted)] focus-visible:ring-0"
          />
          {championship ? (
            <button
              type="button"
              onClick={() => onChampionshipChange('')}
              aria-label="Limpar busca"
              className="grid size-11 shrink-0 place-items-center border border-transparent hover:border-[var(--onside-ink)] hover:bg-[var(--onside-stone)]"
            >
              <Xmark
                size={14}
                color="currentColor"
                className="text-[var(--onside-muted)]"
                aria-hidden="true"
              />
            </button>
          ) : null}
        </div>

        <button
          type="button"
          onClick={onRequestLocation}
          disabled={locationBusy}
          className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 border border-[var(--onside-ink)] bg-[var(--onside-paper)] px-4 font-bold text-xs uppercase tracking-[0.08em] text-[var(--onside-ink)] transition-colors hover:bg-[var(--onside-stone)] disabled:opacity-60"
        >
          {locationBusy ? (
            <Loader
              size={16}
              color="currentColor"
              className="animate-spin"
              aria-hidden="true"
            />
          ) : (
            <Crosshairs size={16} color="currentColor" aria-hidden="true" />
          )}
          {locationBusy
            ? 'Obtendo…'
            : locationGranted
              ? 'Atualizar localização'
              : 'Usar minha localização'}
        </button>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between lg:gap-0">
        <fieldset className="min-w-0">
          <legend className="sr-only">Filtrar por esporte</legend>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onSportChange(undefined)}
              aria-pressed={!sportId}
              className={`${chipBase} ${
                !sportId
                  ? 'bg-[var(--onside-ink)] text-[var(--onside-paper)]'
                  : 'bg-[var(--onside-paper)] text-[var(--onside-ink)] hover:bg-[var(--onside-stone)]'
              }`}
            >
              Todos
            </button>
            {sportsState.status === 'loading' ? (
              <span
                className="inline-flex min-h-11 items-center gap-2 text-[var(--onside-muted)] text-xs"
                aria-live="polite"
              >
                <Loader
                  size={14}
                  color="currentColor"
                  className="animate-spin"
                  aria-hidden="true"
                />
                Carregando esportes…
              </span>
            ) : null}
            {sportsState.status === 'error' ? (
              <span className="inline-flex min-h-11 flex-wrap items-center gap-2 text-xs">
                <span className="text-[var(--onside-live-text)]">
                  Não foi possível carregar os esportes.
                </span>
                <button
                  type="button"
                  onClick={sportsState.retry}
                  className="min-h-11 font-bold text-[var(--onside-ink)] underline underline-offset-2"
                >
                  Tentar de novo
                </button>
              </span>
            ) : null}
            {sportsState.status === 'ready' &&
            sportsState.sports.length === 0 ? (
              <span className="min-h-11 text-[var(--onside-muted)] text-xs">
                Nenhum esporte disponível.
              </span>
            ) : null}
            {sportsState.status === 'ready'
              ? sportsState.sports.map((sport) => {
                  const selected = sportId === sport.id
                  return (
                    <button
                      key={sport.id}
                      type="button"
                      onClick={() =>
                        onSportChange(
                          sportId === sport.id ? undefined : sport.id
                        )
                      }
                      aria-pressed={selected}
                      className={`${chipBase} ${
                        selected
                          ? 'bg-[var(--onside-acid)] text-[var(--onside-ink)]'
                          : 'bg-[var(--onside-paper)] text-[var(--onside-ink)] hover:bg-[var(--onside-stone)]'
                      }`}
                    >
                      <SportIcon
                        slug={sport.slug}
                        name={sport.name}
                        size={15}
                        color="currentColor"
                        aria-hidden="true"
                      />
                      {sport.name}
                    </button>
                  )
                })
              : null}
          </div>
        </fieldset>

        <div
          className="hidden h-10 w-px shrink-0 self-center bg-[var(--onside-ink)] lg:mx-4 lg:block"
          aria-hidden="true"
        />

        <fieldset className="shrink-0">
          <div className="flex flex-wrap items-center gap-2">
            <legend className="onside-kicker m-0 shrink-0 pr-1">Raio</legend>
            <div className="flex flex-wrap gap-2">
              {SEARCH_RADII.map((km) => {
                const selected = radiusKm === km
                const suggested = km === DEFAULT_RADIUS_KM
                return (
                  <button
                    key={km}
                    type="button"
                    onClick={() => onRadiusChange(km)}
                    aria-pressed={selected}
                    className={`relative inline-flex min-h-11 min-w-[3.75rem] flex-col items-center justify-center border border-[var(--onside-ink)] px-3 py-1.5 font-bold text-xs uppercase tracking-[0.04em] tabular-nums transition-colors ${
                      selected
                        ? 'bg-[var(--onside-acid)] text-[var(--onside-ink)]'
                        : 'bg-[var(--onside-paper)] text-[var(--onside-ink)] hover:bg-[var(--onside-stone)]'
                    }`}
                  >
                    <span className="leading-none">{RADIUS_LABELS[km]}</span>
                    {suggested ? (
                      <span
                        className={`mt-0.5 font-[family-name:var(--onside-mono)] text-[8px] font-bold tracking-[0.1em] ${
                          selected
                            ? 'text-[var(--onside-ink)] opacity-70'
                            : 'text-[var(--onside-muted)]'
                        }`}
                      >
                        Sugerido
                      </span>
                    ) : null}
                  </button>
                )
              })}
            </div>
          </div>
        </fieldset>
      </div>

      {activeFilters.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          {activeFilters.map((filter) => (
            <button
              key={filter.label}
              type="button"
              onClick={filter.clear}
              className="inline-flex min-h-11 items-center gap-1.5 border border-[var(--onside-ink)] bg-[var(--onside-stone)] px-3 font-bold text-[var(--onside-ink)] text-xs"
              aria-label={`Remover filtro ${filter.label}`}
            >
              {filter.label}
              <Xmark size={12} color="currentColor" aria-hidden="true" />
            </button>
          ))}
          <button
            type="button"
            onClick={onReset}
            className="min-h-11 font-bold text-[11px] text-[var(--onside-muted)] transition-colors hover:text-[var(--onside-live-text)]"
          >
            Limpar filtros
          </button>
        </div>
      ) : null}
    </div>
  )
}
