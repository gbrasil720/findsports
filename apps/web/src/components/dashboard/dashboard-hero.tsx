import type { LocationState } from '@/domain/discovery'

type Props = {
  isLoading: boolean
  count: number
  locationState: LocationState
}

export function DashboardHero({ isLoading, count, locationState }: Props) {
  const hasRealLocation = locationState === 'granted'

  let statusLabel: string
  if (isLoading) {
    statusLabel = 'Buscando bares…'
  } else if (hasRealLocation) {
    statusLabel = `${count} ${count === 1 ? 'bar' : 'bares'} perto de você`
  } else if (locationState === 'requesting') {
    statusLabel = 'Obtendo sua localização…'
  } else {
    statusLabel = `${count} ${count === 1 ? 'bar' : 'bares'} em São Paulo`
  }

  return (
    <div className="mb-6">
      <div className="mb-3 inline-flex items-center gap-2 font-[family-name:var(--onside-mono)] text-[11px] font-bold text-[var(--onside-live-text)] uppercase tracking-[0.16em]">
        <span className="onside-live-dot is-pulse" aria-hidden="true" />
        Bares perto de você
      </div>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between lg:gap-10">
        <h1 className="onside-display max-w-[14ch] text-[42px] leading-[0.92] md:text-[56px] lg:text-[64px]">
          Onde você assiste hoje?
        </h1>
        <p className="max-w-[22rem] text-[var(--onside-muted)] text-sm leading-snug lg:pb-1.5 lg:text-right">
          Encontre bares que transmitem seu jogo, campeonato ou esporte
          favorito.
        </p>
      </div>
      {/* Visually hidden status for screen readers; count is shown under Resultados */}
      <p className="sr-only" aria-live="polite">
        {statusLabel}
      </p>
    </div>
  )
}
