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
  retryable?: boolean
}

/** Esportes do onboarding do torcedor, em cartões de dois em dois (WEB-501). */
export function SportSelector({
  sports,
  selectedIds,
  onToggle,
  isLoading,
  isError,
  onRetry,
  retryable = true
}: Props) {
  if (isLoading) {
    return (
      <div className="ob-sports" role="status" aria-busy="true">
        <span className="sr-only">Carregando esportes…</span>
        {['a', 'b', 'c', 'd', 'e', 'f'].map((id) => (
          <span key={id} className="sk" aria-hidden="true" />
        ))}
      </div>
    )
  }

  if (isError) {
    return (
      <div className="ob-card" role="alert">
        <div className="ob-ln">
          <span>
            <b>Não foi possível carregar os esportes.</b>
          </span>
          {onRetry && retryable ? (
            <button
              type="button"
              onClick={onRetry}
              className="btn btn-ghost ob-sm"
            >
              Tentar novamente
            </button>
          ) : null}
        </div>
      </div>
    )
  }

  if (sports.length === 0) {
    return <p className="ob-note">Nenhum esporte disponível no momento.</p>
  }

  return (
    <fieldset className="ob-cg">
      <legend className="sr-only">Esportes favoritos</legend>
      <div className="ob-sports">
        {sports.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onToggle(s.id)}
            aria-pressed={selectedIds.includes(s.id)}
            aria-label={s.name}
          >
            <span className="e">
              <SportIcon
                slug={s.slug}
                name={s.name}
                presentation="onboarding"
                size={22}
                color="currentColor"
                aria-hidden="true"
              />
            </span>
            {s.name}
          </button>
        ))}
      </div>
    </fieldset>
  )
}
