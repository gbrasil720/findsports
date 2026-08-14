import type { Ref } from 'react'

export function MapLoadError({
  message,
  onRetry
}: {
  message: string
  onRetry: () => void
}) {
  return (
    <div className="absolute inset-0 grid place-items-center bg-[var(--onside-stone)] p-6 text-center">
      <div>
        <div className="font-bold text-[var(--onside-ink)] text-sm">
          Mapa indisponível
        </div>
        <div className="mt-1 text-[var(--onside-muted)] text-xs">{message}</div>
        <button
          type="button"
          className="onside-btn onside-btn-outline mt-4 min-h-11"
          onClick={onRetry}
        >
          Tentar novamente
        </button>
      </div>
    </div>
  )
}

export function MapCanvas({
  containerRef,
  ready
}: {
  containerRef: Ref<HTMLDivElement>
  ready: boolean
}) {
  return (
    <div className="absolute inset-0">
      {!ready ? (
        <div
          className="absolute inset-0 z-[1] grid place-items-center bg-[var(--onside-stone)]"
          aria-busy="true"
          aria-live="polite"
        >
          <span className="text-sm text-[var(--onside-muted)]">
            Carregando mapa…
          </span>
        </div>
      ) : null}
      <div ref={containerRef} className="absolute inset-0" />
    </div>
  )
}
