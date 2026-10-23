import Location from 'reicon-react/icons/Location'
import type { LocationState, RadiusKm } from '@/domain/discovery'

type Props = {
  isLoading: boolean
  count: number
  radiusKm: RadiusKm
  locationState: LocationState
  /** A cidade em que a busca cai sem a localização: a do perfil ou São Paulo. */
  fallbackCityName: string
  onRequestLocation: () => void
}

export function DashboardHero({
  isLoading,
  count,
  radiusKm,
  locationState,
  fallbackCityName,
  onRequestLocation
}: Props) {
  const hasRealLocation = locationState === 'granted'
  // `unknown` é antes de o navegador responder (e o HTML do servidor): o
  // botão piscaria para quem já liberou a localização.
  const offerLocation =
    locationState === 'idle' ||
    locationState === 'denied' ||
    locationState === 'unavailable'

  let statusLabel: string
  if (isLoading) {
    statusLabel = 'Buscando bares…'
  } else if (hasRealLocation) {
    statusLabel = `${count} ${count === 1 ? 'bar' : 'bares'} perto de você`
  } else if (locationState === 'requesting') {
    statusLabel = 'Obtendo sua localização…'
  } else {
    // Sem localização a busca parte do centro da cidade do perfil — ou de São
    // Paulo, sem ela (WEB-319) —, no raio marcado: "em São Paulo" prometia a
    // cidade inteira (WEB-287).
    statusLabel = `${count} ${count === 1 ? 'bar' : 'bares'} a até ${radiusKm} km do centro de ${fallbackCityName}`
  }

  return (
    <div className="mb-6">
      <div className="mb-3 inline-flex items-center gap-2 font-[family-name:var(--onside-mono)] text-[11px] font-bold text-[var(--onside-live-text)] uppercase tracking-[0.16em]">
        <span className="onside-live-dot is-pulse" aria-hidden="true" />
        Bares perto de você
      </div>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between lg:gap-10">
        <h1 className="onside-display max-w-[14ch] text-[42px] md:text-[56px] lg:text-[64px]">
          Onde você assiste hoje?
        </h1>
        <p className="max-w-[22rem] text-[var(--onside-muted)] text-sm leading-snug lg:pb-1.5 lg:text-right">
          Encontre bares que transmitem seu jogo, campeonato ou esporte
          favorito.
        </p>
      </div>
      {/* De onde a distância parte fica à vista: escondido para quem enxerga,
          o "17 km" do card medido do centro da cidade parecia erro. O pedido
          de localização continua só no clique (WEB-266). */}
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <p
          className="text-[var(--onside-muted)] text-sm leading-snug"
          aria-live="polite"
        >
          {statusLabel}
        </p>
        {offerLocation ? (
          <button
            type="button"
            onClick={onRequestLocation}
            className="inline-flex items-center gap-1.5 font-bold text-[var(--onside-ink)] text-sm underline underline-offset-2"
          >
            <Location size={14} color="currentColor" aria-hidden="true" />
            Usar minha localização
          </button>
        ) : null}
      </div>
    </div>
  )
}
