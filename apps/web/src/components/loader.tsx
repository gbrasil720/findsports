import { Skeleton } from '@findsports_oficial/ui/components/skeleton'

export function Loader() {
  return (
    <div
      className="grid min-h-[50vh] place-items-center px-4 py-8"
      role="status"
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">Carregando página…</span>
      <div className="w-full max-w-2xl space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-4 w-72 max-w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    </div>
  )
}
