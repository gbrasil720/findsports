import { Skeleton } from '@findsports_oficial/ui/components/skeleton'

type Props = {
  count: number
  loading?: boolean
}

export function BarResultsHeader({ count, loading = false }: Props) {
  return (
    <div className="mb-3">
      <h2 className="onside-display text-2xl tracking-wide">Resultados</h2>
      <div className="mt-1 font-[family-name:var(--onside-mono)] text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--onside-muted)] tabular-nums">
        {loading ? (
          <Skeleton className="h-3.5 w-20" />
        ) : (
          `${count} ${count === 1 ? 'bar' : 'bares'}`
        )}
      </div>
    </div>
  )
}
