type Props = {
  count: number
}

export function BarResultsHeader({ count }: Props) {
  return (
    <div className="mb-3">
      <h2 className="onside-display text-2xl tracking-wide">Resultados</h2>
      <p className="mt-1 font-[family-name:var(--onside-mono)] text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--onside-muted)] tabular-nums">
        {count} {count === 1 ? 'bar' : 'bares'}
      </p>
    </div>
  )
}
