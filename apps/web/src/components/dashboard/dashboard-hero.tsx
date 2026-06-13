type Props = {
  isLoading: boolean
  count: number
  locationError: boolean
}

export function DashboardHero({ isLoading, count, locationError }: Props) {
  return (
    <div className="mb-6">
      <div className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.25em] text-brand-orange mb-2">
        <span className="size-1.5 rounded-full bg-brand-orange animate-pulse" />
        {isLoading
          ? 'Buscando bares...'
          : `${count} ${count === 1 ? 'bar' : 'bares'} perto de você`}
      </div>
      <h1 className="font-heading text-3xl md:text-4xl font-bold tracking-tight">
        Onde você assiste hoje?
      </h1>
      {locationError && (
        <p className="text-xs text-zinc-500 mt-1">
          Localização não disponível — mostrando bares em São Paulo.
        </p>
      )}
    </div>
  )
}
