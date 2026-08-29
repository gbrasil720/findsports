import Check from 'reicon-react/icons/Check'
import type { RadiusKm } from '@/domain/discovery'

const RADIUS_LABELS: Record<number, string> = {
  1: 'a pé',
  3: 'bem perto',
  5: 'no bairro',
  10: 'explorar mais'
}

type Props = {
  value: RadiusKm
  options: readonly RadiusKm[]
  onChange: (km: RadiusKm) => void
}

export function RadiusSelector({ value, options, onChange }: Props) {
  return (
    <fieldset className="border-0 p-0 m-0">
      <legend className="sr-only">Raio de busca em quilômetros</legend>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {options.map((km) => {
          const on = value === km
          return (
            <button
              key={km}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(km)}
              className={`onside-choice onside-choice-ink relative min-h-11 ${on ? 'is-selected' : ''}`}
            >
              <div className="onside-display text-3xl leading-none tabular-nums">
                {km}
              </div>
              <div className="font-[family-name:var(--onside-mono)] text-[10px] uppercase tracking-[0.12em] opacity-80">
                km · {RADIUS_LABELS[km] ?? ''}
              </div>
              {on && (
                <Check
                  size={14}
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
