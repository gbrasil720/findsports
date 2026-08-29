import { Skeleton } from '@findsports_oficial/ui/components/skeleton'
import Check from 'reicon-react/icons/Check'
import { SportIcon } from '@/components/sports/sport-icon'

type Sport = {
  id: string
  name: string
  slug: string
}

type Props = {
  sports: Sport[]
  selectedIds: string[]
  onToggle: (id: string) => void
  isLoading: boolean
  isError?: boolean
  onRetry?: () => void
}

export function SportSelector({
  sports,
  selectedIds,
  onToggle,
  isLoading,
  isError,
  onRetry
}: Props) {
  if (isLoading) {
    return (
      <div
        className="grid grid-cols-2 gap-3 md:grid-cols-3"
        aria-busy="true"
        aria-live="polite"
      >
        <span className="sr-only">Carregando esportes…</span>
        {['a', 'b', 'c', 'd', 'e', 'f'].map((id) => (
          <Skeleton
            key={id}
            className="h-[108px] rounded-none bg-[rgb(241_238_230_/_10%)]"
          />
        ))}
      </div>
    )
  }

  if (isError) {
    return (
      <div
        className="onside-callout onside-callout-danger text-[var(--onside-paper)]"
        role="alert"
      >
        <p className="text-sm">Não foi possível carregar os esportes.</p>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="onside-btn onside-btn-outline min-h-11 border-[var(--onside-paper)] text-[var(--onside-paper)]"
          >
            Tentar novamente
          </button>
        ) : null}
      </div>
    )
  }

  if (sports.length === 0) {
    return (
      <p className="text-sm text-[color-mix(in_srgb,var(--onside-paper)_72%,transparent)]">
        Nenhum esporte disponível no momento.
      </p>
    )
  }

  return (
    <fieldset className="m-0 border-0 p-0">
      <legend className="sr-only">Esportes favoritos</legend>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {sports.map((s) => {
          const on = selectedIds.includes(s.id)
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onToggle(s.id)}
              aria-pressed={on}
              aria-label={s.name}
              className={`onside-choice onside-choice-ink relative min-h-11 ${on ? 'is-selected' : ''}`}
            >
              <SportIcon
                slug={s.slug}
                name={s.name}
                presentation="onboarding"
                size={24}
                color="currentColor"
                className="mb-1 font-[family-name:var(--onside-mono)] text-xs font-bold tracking-[0.12em]"
                aria-hidden="true"
              />
              <div className="font-bold text-lg leading-none">{s.name}</div>
              {on && (
                <Check
                  size={16}
                  color="currentColor"
                  className="absolute top-3 right-3"
                  aria-hidden="true"
                />
              )}
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}
